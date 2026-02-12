import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { ConnectionState } from '../types';
import { createPcmBlob, base64ToUint8Array, decodeAudioData, arrayBufferToBase64 } from '../utils/audioUtils';
import { FileSystemManager } from '../utils/fileSystem';
import { CalendarManager } from '../utils/calendarSystem';

const BASE_SYSTEM_INSTRUCTION = `
You are an advanced multimodal AI assistant embedded inside a real-time interactive AI avatar.

CORE CAPABILITIES:
- You can see and hear the user.
- You have ACCESS to the user's local file system if they have mounted a workspace.
- You have ACCESS to a CALENDAR system to schedule tasks and set reminders.
- You have ACCESS to the WEB via a browser tool to open searches and websites.

BEHAVIOR:
- Be concise.
- Output text is for the user's benefit: keep it relevant to their query.
- If you perform a file operation, confirm it verbally ("I've saved the file").
- When scheduling events, ensure you get a specific time from the user. 
- You interpret "tomorrow", "in 5 minutes", etc., based on the CURRENT DATE AND TIME provided to you.
- If the user asks to "search" for something, use the 'searchWeb' tool.
- If the user asks to go to a specific site or "play X on YouTube", construct the appropriate URL and use 'openUrl'.
`;

// Define Tool Declarations with strict schemas
const toolsConfig = [
  // --- File System Tools ---
  {
    functionDeclarations: [
      {
        name: "listFiles",
        description: "List all files in the currently connected workspace directory.",
        parameters: {
          type: Type.OBJECT,
          properties: {
             path: { type: Type.STRING, description: "Optional sub-path to list. Defaults to root." }
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
      },
      // --- Calendar Tools ---
      {
        name: "scheduleEvent",
        description: "Schedule a reminder, alarm, or calendar event.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the event or task" },
            time: { type: Type.STRING, description: "ISO 8601 date string (e.g., '2023-10-27T14:30:00'). Calculate this based on user's relative time request and current time." }
          },
          required: ["title", "time"]
        }
      },
      {
        name: "listEvents",
        description: "List upcoming scheduled events and reminders.",
        parameters: {
          type: Type.OBJECT,
          properties: {
             dummy: { type: Type.STRING, description: "Unused" }
          }
        }
      },
      {
        name: "deleteEvent",
        description: "Delete an event by title or ID.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            identifier: { type: Type.STRING, description: "The title or ID of the event to delete" }
          },
          required: ["identifier"]
        }
      },
      // --- Browser Tools ---
      {
        name: "searchWeb",
        description: "Search Google for a query. Use this when the user asks to search for something.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "The search query (e.g., 'weather in Tokyo')" }
          },
          required: ["query"]
        }
      },
      {
        name: "openUrl",
        description: "Open a specific URL in the browser. Use this to navigate to websites.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: "The full URL (e.g., 'https://www.youtube.com')" }
          },
          required: ["url"]
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
  const calendarManager = useRef(new CalendarManager());

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
        if (e.name === 'AbortError') return false; // User cancelled
        
        // Handle iframe restrictions (SecurityError or specific message)
        if (e.name === 'SecurityError' || e.message?.includes("Cross origin sub frames") || e.message?.includes("security")) {
             setError("Access Denied: Browser security blocks file access in this preview window. Please open the app in a new tab.");
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
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
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
           sessionRef.current = null; // Guard against re-entry
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

    // Ensure strict cleanup before reconnecting
    if (sessionRef.current) {
        await disconnect();
    }

    setConnectionState(ConnectionState.CONNECTING);
    setError(null);

    // Request notification permission for calendar
    calendarManager.current.requestPermission();

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      analyserRef.current = outputAudioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      outputGainRef.current = outputAudioContextRef.current.createGain();
      outputGainRef.current.connect(analyserRef.current);
      analyserRef.current.connect(outputAudioContextRef.current.destination);

      const updateVolume = () => {
        if (!analyserRef.current || connectionState === ConnectionState.DISCONNECTED) return;
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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Inject current time into system instruction
      const currentTime = new Date().toLocaleString();
      const dynamicSystemInstruction = `${BASE_SYSTEM_INSTRUCTION}\nCURRENT SYSTEM DATE/TIME: ${currentTime}`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO], 
          systemInstruction: dynamicSystemInstruction, 
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          // Enable input transcription to detect commands like "Bye"
          inputAudioTranscription: {},
          tools: toolsConfig,
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setConnectionState(ConnectionState.CONNECTED);

            if (!inputAudioContextRef.current) return;
            inputAudioContextRef.current.resume();

            // Delay audio streaming slightly to ensure connection stability
            setTimeout(() => {
                if (!inputAudioContextRef.current) return;
                
                inputSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
                processorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                
                processorRef.current.onaudioprocess = (e) => {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcmBlob = createPcmBlob(inputData);
                  sessionPromise.then(session => {
                      session.sendRealtimeInput({ media: pcmBlob });
                  });
                };
    
                inputSourceRef.current.connect(processorRef.current);
                processorRef.current.connect(inputAudioContextRef.current.destination);
    
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
                            session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } });
                        });
                    }, 1000 / FPS);
                }
            }, 100);
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle Output Transcription
             if (message.serverContent?.outputTranscription?.text) {
                 setTranscript(prev => prev + message.serverContent.outputTranscription.text);
             }

             // Handle Input Transcription
             if (message.serverContent?.inputTranscription?.text) {
                 const text = message.serverContent.inputTranscription.text.trim();
                 if (text.toLowerCase().includes("bye")) {
                     disconnect();
                     return;
                 }
             }

             // Handle Tool Calls
             if (message.toolCall) {
                console.log("Tool Call Received:", message.toolCall);
                const session = await sessionPromise;
                
                for (const fc of message.toolCall.functionCalls) {
                    let result = "Unknown Error";
                    try {
                        // --- File System ---
                        if (fc.name === "listFiles") {
                            const files = await fileSystemManager.current.listFiles();
                            result = JSON.stringify(files);
                        } else if (fc.name === "readFile") {
                            const args = fc.args as any;
                            result = await fileSystemManager.current.readFile(args.filename);
                        } else if (fc.name === "writeFile") {
                            const args = fc.args as any;
                            result = await fileSystemManager.current.writeFile(args.filename, args.content);
                            setTranscript(prev => prev + `\n[System] Wrote to file: ${args.filename}\n`);
                        } 
                        // --- Calendar ---
                        else if (fc.name === "scheduleEvent") {
                            const args = fc.args as any;
                            result = await calendarManager.current.scheduleEvent(args.title, args.time);
                            setTranscript(prev => prev + `\n[Calendar] Scheduled: ${args.title} at ${args.time}\n`);
                        } else if (fc.name === "listEvents") {
                            result = await calendarManager.current.listEvents();
                        } else if (fc.name === "deleteEvent") {
                            const args = fc.args as any;
                            result = await calendarManager.current.deleteEvent(args.identifier);
                        }
                        // --- Browser ---
                        else if (fc.name === "searchWeb") {
                            const args = fc.args as any;
                            const query = args.query;
                            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                            const win = window.open(url, '_blank');
                            result = win ? `Opened search for "${query}"` : `Browser blocked popup for search: ${url}`;
                            setTranscript(prev => prev + `\n[Browser] Opening Search: ${query}\n`);
                        }
                        else if (fc.name === "openUrl") {
                            const args = fc.args as any;
                            const url = args.url;
                            const win = window.open(url, '_blank');
                            result = win ? `Opened URL: ${url}` : `Browser blocked popup for URL: ${url}`;
                            setTranscript(prev => prev + `\n[Browser] Opening URL: ${url}\n`);
                        }
                        else {
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

             // Handle Audio Output
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
          onclose: () => {
            console.log("Session Closed");
            disconnect();
          },
          onerror: (err) => {
            console.error("Session Error", err);
            if (connectionState === ConnectionState.DISCONNECTED) return;
            setError("Connection error. The session was interrupted.");
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