import React, { useRef, useEffect } from 'react';

interface VideoFeedProps {
  onVideoRef: (video: HTMLVideoElement) => void;
  isActive: boolean;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ onVideoRef, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef(videoRef.current);
    }
    
    const startVideo = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (e) {
            console.error("Failed to access camera", e);
        }
    };

    if (isActive) {
        startVideo();
    } else {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }
  }, [isActive, onVideoRef]);

  // If not active, render nothing to keep UI clean
  if (!isActive) return null;

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden bg-black shadow-lg">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-cover transform scale-x-[-1]" 
      />
    </div>
  );
};

export default VideoFeed;