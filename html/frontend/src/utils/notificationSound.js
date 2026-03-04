// Notification Sound Utility
// Воспроизводит звуковые уведомления в браузере

class NotificationSound {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
    this.volume = 0.5;
    
    // Load preference from localStorage
    const saved = localStorage.getItem('notificationSound');
    if (saved !== null) {
      this.enabled = saved === 'true';
    }
  }

  // Initialize AudioContext (requires user interaction first)
  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  // Play a notification beep
  playNotification(type = 'message') {
    if (!this.enabled) return;
    
    try {
      const ctx = this.init();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Different sounds for different notification types
      switch (type) {
        case 'message':
          // Pleasant chime for new messages
          oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
          oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6
          gainNode.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.3);
          break;
          
        case 'alert':
          // More urgent sound for alerts
          oscillator.frequency.setValueAtTime(600, ctx.currentTime);
          oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.15);
          oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.3);
          gainNode.gain.setValueAtTime(this.volume * 0.4, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.5);
          break;
          
        case 'success':
          // Happy ascending tone
          oscillator.frequency.setValueAtTime(523, ctx.currentTime); // C5
          oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
          oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
          gainNode.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.4);
          break;
          
        case 'error':
          // Low warning tone
          oscillator.frequency.setValueAtTime(200, ctx.currentTime);
          oscillator.frequency.setValueAtTime(150, ctx.currentTime + 0.2);
          gainNode.gain.setValueAtTime(this.volume * 0.4, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.4);
          break;
          
        default:
          // Default beep
          oscillator.frequency.setValueAtTime(440, ctx.currentTime);
          gainNode.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.2);
      }
      
      console.log(`🔔 Sound played: ${type}`);
    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }

  // Toggle sound on/off
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('notificationSound', String(this.enabled));
    return this.enabled;
  }

  // Set volume (0-1)
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  // Request browser notification permission
  async requestPermission() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }
    
    if (Notification.permission === 'granted') {
      return true;
    }
    
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    
    return false;
  }

  // Show browser notification with sound
  async showNotification(title, body, options = {}) {
    // Play sound first
    this.playNotification(options.type || 'message');
    
    // Try to show browser notification
    const hasPermission = await this.requestPermission();
    if (hasPermission) {
      const notification = new Notification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: options.tag || 'default',
        renotify: true,
        ...options
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
        if (options.onClick) options.onClick();
      };
      
      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
      
      return notification;
    }
    
    return null;
  }
}

// Singleton instance
export const notificationSound = new NotificationSound();
export default notificationSound;
