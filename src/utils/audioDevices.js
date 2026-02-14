/**
 * audioDevices.js – Audio Input Device Enumeration & Selection
 *
 * HOW DEVICE ENUMERATION WORKS
 * ────────────────────────────
 * 1. We call navigator.mediaDevices.enumerateDevices() which returns
 *    an array of MediaDeviceInfo objects for every media device the OS
 *    exposes to the browser/Electron renderer (microphones, speakers,
 *    cameras, virtual audio cables, etc.).
 *
 * 2. We filter to kind === 'audioinput' so only microphone-class
 *    devices are shown.  This includes physical mics, Sonar virtual
 *    channels, VB-Cable virtual devices, and any other audio input.
 *
 * 3. Device names are NOT hardcoded.  The dropdown is built from the
 *    live enumeration so it always reflects the current system state.
 *
 * 4. After the user picks a device, we call getUserMedia() with
 *    { audio: { deviceId: { exact: selectedDeviceId } } } to lock onto
 *    that specific device.  The `exact` constraint ensures we get that
 *    device or fail, rather than silently falling back to the default.
 *
 * NOTE: enumerateDevices() may return empty labels until the user has
 * granted microphone permission at least once.  We request a temporary
 * stream first (see requestPermissionAndEnumerate) to force the
 * permission prompt, then enumerate.
 */

/**
 * Request microphone permission (if not already granted) and return the
 * full list of audio input devices with labels populated.
 * @returns {Promise<MediaDeviceInfo[]>}
 */
export async function getAudioInputDevices() {
  // A quick getUserMedia call forces the browser permission prompt so
  // that enumerateDevices() returns device labels (not blank strings).
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the temporary stream immediately – we only needed it for the
    // permission grant.
    tempStream.getTracks().forEach((t) => t.stop());
  } catch {
    // Permission denied or no devices – enumerateDevices will return
    // whatever it can; labels may be blank.
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput');
}

/**
 * Open a MediaStream for a specific audio input device.
 *
 * @param {string} deviceId – the deviceId from enumerateDevices()
 * @returns {Promise<MediaStream>}
 */
export async function openAudioStream(deviceId) {
  // The `exact` constraint guarantees we capture from the chosen device
  // rather than silently falling back to the OS default.
  return navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId } },
  });
}
