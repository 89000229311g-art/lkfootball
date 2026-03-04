import { pushAPI } from '../api/client';

export async function subscribeToPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check if already subscribed
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
        // We could update the subscription on backend just in case
        console.log('Already subscribed to push notifications');
        await pushAPI.subscribe(existingSubscription, navigator.userAgent);
        return true;
    }

    // Get public key
    const response = await pushAPI.getVapidPublicKey();
    const vapidPublicKey = response.data.public_key;
    
    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    console.log('Push Subscription:', subscription);

    // Send to backend
    await pushAPI.subscribe(subscription, navigator.userAgent);
    return true;

  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
