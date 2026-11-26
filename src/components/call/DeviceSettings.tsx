'use client';

import React from 'react';
import { Mic, Video, Volume2 } from 'lucide-react';
import type { LocalMedia } from './useLocalMedia';

/** Speaker selection works where the browser supports setSinkId (Chrome, Edge). */
export const canPickSpeaker = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

interface Props {
  media: LocalMedia;
  showVideo: boolean;
  tone?: 'light' | 'dark';
}

export default function DeviceSettings({ media, showVideo, tone = 'light' }: Props) {
  const dark = tone === 'dark';
  const select = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-4 ${
    dark ? 'border-white/15 bg-white/10 text-white focus:ring-white/10' : 'border-line bg-white text-ink focus:border-forest focus:ring-forest/10'
  }`;
  const label = `mb-1 flex items-center gap-1.5 text-xs font-semibold ${dark ? 'text-white/70' : 'text-ink-muted'}`;

  const rows: { key: 'audioIn' | 'videoIn' | 'audioOut'; title: string; icon: typeof Mic; options: { deviceId: string; label: string }[]; show: boolean }[] = [
    { key: 'audioIn', title: 'Microphone', icon: Mic, options: media.devices.audioIn, show: true },
    { key: 'videoIn', title: 'Camera', icon: Video, options: media.devices.videoIn, show: showVideo },
    { key: 'audioOut', title: 'Speaker', icon: Volume2, options: media.devices.audioOut, show: canPickSpeaker() && media.devices.audioOut.length > 0 },
  ];

  return (
    <div className="space-y-3">
      {rows
        .filter((r) => r.show)
        .map((r) => (
          <div key={r.key}>
            <label htmlFor={`dev-${r.key}`} className={label}>
              <r.icon className="h-3.5 w-3.5" /> {r.title}
            </label>
            {r.options.length === 0 ? (
              <p className={`text-xs ${dark ? 'text-white/50' : 'text-ink-muted'}`}>None found</p>
            ) : (
              <select
                id={`dev-${r.key}`}
                value={media.selected[r.key] || r.options[0]?.deviceId || ''}
                onChange={(e) => media.switchDevice(r.key, e.target.value)}
                className={select}
              >
                {r.options.map((o) => (
                  <option key={o.deviceId} value={o.deviceId} className="text-ink">
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
    </div>
  );
}
