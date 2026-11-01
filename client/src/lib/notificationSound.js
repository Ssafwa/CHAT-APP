let audioContext;
let soundEnabled = localStorage.getItem("quickchat.soundEnabled") !== "false";

export async function enableNotificationSound() {
    if (!soundEnabled) return false;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
        audioContext ??= new AudioContextClass();
        await audioContext.resume();
        soundEnabled = audioContext.state === "running";
    } catch {
        soundEnabled = false;
    }

    return soundEnabled;
}

export function setNotificationSoundEnabled(enabled) {
    soundEnabled = enabled;
    localStorage.setItem("quickchat.soundEnabled", String(enabled));
    if (enabled) return enableNotificationSound();
    return Promise.resolve(false);
}

export function isNotificationSoundEnabled() {
    return soundEnabled;
}

export function playNotificationSound() {
    if (!soundEnabled || !audioContext || audioContext.state !== "running") return;

    const now = audioContext.currentTime;
    [880, 1174].forEach((frequency, index) => {
        const start = now + index * 0.09;
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        volume.gain.setValueAtTime(0.0001, start);
        volume.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

        oscillator.connect(volume);
        volume.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.17);
    });
}
