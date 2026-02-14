/**
 * DeviceSelector.js – Audio Input Device Dropdown Component
 *
 * Renders a <select> dropdown populated with audio input devices.
 * Devices are enumerated dynamically via
 * navigator.mediaDevices.enumerateDevices(); no names are hardcoded.
 *
 * Props:
 *   label    {string}             – dropdown label text
 *   devices  {MediaDeviceInfo[]}  – audio input devices from enumeration
 *   value    {string}             – currently selected deviceId
 *   onChange {function(deviceId)} – called when the user picks a device
 *   disabled {boolean}            – disables the dropdown during a call
 */

import React from 'react';

export default function DeviceSelector({ label, devices, value, onChange, disabled }) {
  return (
    <div className="device-selector">
      <label>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">— Select a device —</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Audio Input (${device.deviceId.slice(0, 8)}…)`}
          </option>
        ))}
      </select>
    </div>
  );
}
