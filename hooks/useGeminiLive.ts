import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { ConnectionState } from '../types';
import { createPcmBlob, base64ToUint8Array, decodeAudioData, arrayBufferToBase64 } from '../utils/audioUtils';
import { FileSystemManager } from '../utils/fileSystem';

const SYSTEM_INSTRUCTION = `
You are an advanced multimodal AI assistant embedded inside a real-time interactive AI avatar.

CORE CAPABILITIES:
- You can see and hear the user.
- You have ACCESS to the user's local file system if they have mounted a workspace.
- You can LIST, READ, and WRITE files to this workspace using the provided tools.
- If the user asks you to write code, ALWAYS try to write it directly to a file using the 'writeFile' tool.
- If the user asks about files, list them first to see what's there.

BEHAVIOR:
- Be concise.
- Output text is for the user's benefit: keep it relevant to their query.
- If you perform a file operation, confirm it verbally ("I've saved the file").
`;

// Define Tool Declarations with strict schemas
const toolsConfig = [
  {
    functionDeclarations: [
      {
        name: "listFiles",
        description: "List all files in the currently connected workspace directory.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            // Adding a dummy property to avoid empty object schema issues which can cause "Network Error"
            path: { 
              type: Type.STRING, 
              description: "Optional sub-path to list. Defaults to root." 
            }
          }
        }
      },
      {
        name: "readFile",
        description: "Read the content of a specific file.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filename: { type: Type.STRING, description: "The name of the file to read (e.g., 'script.js')" }
          },
          required: ["filename"]
        }
      },
      {
        name: "writeFile",
        description: "Write text content to a file. Creates it if it doesn't exist.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filename: { type: Type.STRING, description: "The name of the file (e.g., 'notes.txt')" },
            content: { type: Type.STRING, description: "The text content to write into the file" }
          },
          required: ["filename", "content"]
        }
      }
    ]
  }
];

type LiveSession = Awaited<ReturnType<InstanceType<typeof GoogleGenAI>['live']['connect']>>;

interface UseGeminiLiveProps {
  onAudioData: (volume: number) => void;
}

export function useGeminiLive({ onAudioData }: UseGeminiLiveProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [isFileSystemReady, setIsFileSystemReady] = useState(false);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  // Scheduling
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Session & Tools
  const sessionRef = useRef<LiveSession | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const fileSystemManager = useRef(new FileSystemManager());

  const mountDirectory = useCallback(async () => {
    setError(null);
    try {
        if (typeof (window as any).showDirectoryPicker === 'undefined') {
             throw new Error("File System Access API is not supported in this browser environment.");
        }

        const handle = await (window as any).showDirectoryPicker();
        await fileSystemManager.current.setDirectoryHandle(handle);
        setIsFileSystemReady(true);
        return true;
    } catch (e: any) {
        console.error("Failed to mount directory:", e);
        if (e.name === 'AbortError') return false; 
        
        // Handle SecurityError (iframe restrictions) & specific messages
        if (e.name === 'SecurityError' || e.message?.includes("Cross origin sub frames") || e.message?.includes("security")) {
             setError("File access is blocked in this preview environment. Please open the app in a new tab/window to use file features.");
        } else {
             setError(e.message || "Failed to mount directory");
        }
        return false;
    }
  }, []);

  const stopAudioProcessing = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (inputAudioContextRef.current) {
      if (inputAudioContextRef.current.state !== 'closed') {
          inputAudioContextRef.current.close();
      }
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      if (outputAudioContextRef.current.state !== 'closed') {
          outputAudioContextRef.current.close();
      }
      outputAudioContextRef.current = null;
    }
    if (videoIntervalRef.current) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    activeSourcesRef.current.clear();
  }, []);

  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
       try {
           const session = sessionRef.current;
           sessionRef.current = null; 
           await session.close();
       } catch (e) {
           console.warn("Error closing session", e);
       }
    }
    stopAudioProcessing();
    setConnectionState(ConnectionState.DISCONNECTED);
    setTranscript("");
  }, [stopAudioProcessing]);

  const connect = useCallback(async (videoElement: HTMLVideoElement | null) => {
    if (!process.env.API_KEY) {
      setError("API Key is missing.");
      return;
    }

    if (sessionRef.current) {
        await disconnect();
    }

    setConnectionState(ConnectionState.CONNECTING);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const config: any = {
          responseModalities: [Modality.AUDIO], 
          systemInstruction: SYSTEM_INSTRUCTION, 
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
      };

      config.tools = toolsConfig;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: config,
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setConnectionState(ConnectionState.CONNECTED);

            // Initialize Audio Contexts only after success to avoid resource locking on failure
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            analyserRef.current = outputAudioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            outputGainRef.current = outputAudioContextRef.current.createGain();
            outputGainRef.current.connect(analyserRef.current);
            analyserRef.current.connect(outputAudioContextRef.current.destination);

            const updateVolume = () => {
                if (!analyserRef.current || !sessionRef.current) return;
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                const normalizedVolume = Math.min(1, average / 128); 
                onAudioData(normalizedVolume);
                requestAnimationFrame(updateVolume);
            };
            requestAnimationFrame(updateVolume);

            // Start Input Stream
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                 if (!inputAudioContextRef.current) return;
                 inputSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
                 processorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                 
                 processorRef.current.onaudioprocess = (e) => {
                   const inputData = e.inputBuffer.getChannelData(0);
                   const pcmBlob = createPcmBlob(inputData);
                   // Ensure session is still active and valid before sending
                   sessionPromise.then(session => {
                       if (sessionRef.current === session) {
                           session.sendRealtimeInput({ media: pcmBlob });
                       }
                   }).catch(err => console.debug("Skipping input send, session not ready"));
                 };
     
                 inputSourceRef.current.connect(processorRef.current);
                 processorRef.current.connect(inputAudioContextRef.current.destination);
            });

            // Start Video Stream
            if (videoElement) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const FPS = 2; 
                videoIntervalRef.current = window.setInterval(() => {
                    if (!ctx || !videoElement.videoWidth) return;
                    canvas.width = videoElement.videoWidth * 0.25; 
                    canvas.height = videoElement.videoHeight * 0.25;
                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    
                    const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                    sessionPromise.then(session => {
                        if (sessionRef.current === session) {
                            session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } });
                        }
                    }).catch(err => console.debug("Skipping video send"));
                }, 1000 / FPS);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
             if (message.serverContent?.outputTranscription?.text) {
                 setTranscript(prev => prev + message.serverContent.outputTranscription.text);
             }

             if (message.toolCall) {
                console.log("Tool Call Received:", message.toolCall);
                const session = await sessionPromise;
                
                for (const fc of message.toolCall.functionCalls) {
                    let result = "Unknown Error";
                    try {
                        if (fc.name === "listFiles") {
                            // Arg 'path' is ignored as per current simple implementation
                            const files = await fileSystemManager.current.listFiles();
                            result = JSON.stringify(files);
                        } else if (fc.name === "readFile") {
                            const args = fc.args as any;
                            result = await fileSystemManager.current.readFile(args.filename);
                        } else if (fc.name === "writeFile") {
                            const args = fc.args as any;
                            result = await fileSystemManager.current.writeFile(args.filename, args.content);
                            setTranscript(prev => prev + `\n\n[System] Wrote to file: ${args.filename}\n`);
                        } else {
                            result = "Function not found";
                        }
                    } catch (e: any) {
                        result = `Error: ${e.message}`;
                    }

                    session.sendToolResponse({
                        functionResponses: [{
                            id: fc.id,
                            name: fc.name,
                            response: { result: { output: result } }
                        }]
                    });
                }
             }

             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputAudioContextRef.current && outputGainRef.current) {
                const ctx = outputAudioContextRef.current;
                const audioBuffer = await decodeAudioData(
                    base64ToUint8Array(base64Audio),
                    ctx,
                    24000,
                    1
                );
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputGainRef.current);
                
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                
                activeSourcesRef.current.add(source);
                source.onended = () => {
                    activeSourcesRef.current.delete(source);
                };
             }

             if (message.serverContent?.interrupted) {
                 activeSourcesRef.current.forEach(s => s.stop());
                 activeSourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
                 setTranscript("");
             }
          },
          onclose: (e) => {
            console.log("Session Closed", e);
            disconnect();
          },
          onerror: (err) => {
            console.error("Session Error", err);
            setError("Connection error. Please try again.");
            disconnect();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to connect");
      setConnectionState(ConnectionState.ERROR);
      disconnect();
    }
  }, [disconnect, onAudioData]);

  return {
    connectionState,
    error,
    connect,
    disconnect,
    transcript,
    mountDirectory,
    isFileSystemReady
  };
}