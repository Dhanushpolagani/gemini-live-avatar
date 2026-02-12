
export interface CalendarEvent {
  id: string;
  title: string;
  time: string; // ISO String
  completed: boolean;
}

export class CalendarManager {
  private events: CalendarEvent[] = [];
  private audioContext: AudioContext | null = null;
  private checkInterval: number | null = null;

  constructor() {
    this.loadEvents();
    this.startMonitoring();
  }

  private loadEvents() {
    const stored = localStorage.getItem('gemini_avatar_events');
    if (stored) {
      try {
        this.events = JSON.parse(stored);
      } catch (e) {
        this.events = [];
      }
    }
  }

  private saveEvents() {
    localStorage.setItem('gemini_avatar_events', JSON.stringify(this.events));
  }

  private startMonitoring() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    
    // Check every second
    this.checkInterval = window.setInterval(() => {
      const now = new Date();
      this.events.forEach(event => {
        if (!event.completed) {
          const eventTime = new Date(event.time);
          // Trigger if time is passed within the last 2 seconds (to avoid double trigger)
          const diff = now.getTime() - eventTime.getTime();
          
          if (diff >= 0 && diff < 2000) {
            this.triggerAlarm(event);
            event.completed = true;
            this.saveEvents();
          }
        }
      });
    }, 1000);
  }

  private triggerAlarm(event: CalendarEvent) {
    // 1. Browser Notification
    if (Notification.permission === 'granted') {
      new Notification("Reminder: " + event.title, {
        body: `It is time for: ${event.title}`,
        icon: '/favicon.ico' // Fallback
      });
    }

    // 2. Audio Beep
    this.playAlarmSound();
  }

  private playAlarmSound() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Drop to A4
      
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error("Failed to play alarm sound", e);
    }
  }

  async requestPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  }

  async scheduleEvent(title: string, timeString: string): Promise<string> {
    // Validate date
    const date = new Date(timeString);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid time format. Please use ISO 8601 or a recognizable date string.");
    }

    const event: CalendarEvent = {
      id: crypto.randomUUID(),
      title,
      time: date.toISOString(),
      completed: false
    };

    this.events.push(event);
    this.saveEvents();
    return `Scheduled "${title}" for ${date.toLocaleString()}`;
  }

  async listEvents(): Promise<string> {
    // Filter out old completed events for clean listing
    const active = this.events.filter(e => !e.completed || (new Date().getTime() - new Date(e.time).getTime() < 3600000)); // Keep completed for 1 hour
    
    if (active.length === 0) return "No upcoming events scheduled.";
    
    return active
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map(e => `[${e.completed ? 'DONE' : 'TODO'}] ${new Date(e.time).toLocaleString()}: ${e.title} (ID: ${e.id.substring(0,4)})`)
      .join('\n');
  }

  async deleteEvent(partialTitleOrId: string): Promise<string> {
    const initialLen = this.events.length;
    this.events = this.events.filter(e => 
      !e.id.includes(partialTitleOrId) && !e.title.toLowerCase().includes(partialTitleOrId.toLowerCase())
    );
    
    if (this.events.length < initialLen) {
        this.saveEvents();
        return "Event removed.";
    }
    return "Event not found.";
  }
}
