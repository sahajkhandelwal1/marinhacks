"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Connect EEG Device" — UI-only theater, deliberately. There is no
 * Bluetooth/Serial/LSL code behind this: every screen in the app so far
 * replays Chennu et al. 2016 recordings (PRD §10's honesty-label discipline
 * applies here too, see the footer note below). This exists to show what the
 * acquisition step of a real deployment would look like, not to perform it.
 * Picking a device never touches state.dataSource or anything else in
 * useMonitor — connecting here is fully inert.
 */

type Interface = "lsl" | "bluetooth" | "usb";

type DeviceStatus = "idle" | "connecting" | "connected";

type MockDevice = {
  id: string;
  name: string;
  interface: Interface;
  channels: number;
  signal: number; // 0-3 bars
  battery: number | null; // percent, null for wired
};

const INTERFACES: ReadonlyArray<[Interface, string]> = [
  ["lsl", "LSL"],
  ["bluetooth", "Bluetooth"],
  ["usb", "USB"],
];

const DEVICES: MockDevice[] = [
  { id: "liveamp", name: "BrainVision LiveAmp 32", interface: "bluetooth", channels: 32, signal: 3, battery: 82 },
  { id: "nautilus", name: "g.Nautilus PRO", interface: "bluetooth", channels: 16, signal: 2, battery: 54 },
  { id: "cyton", name: "OpenBCI Cyton", interface: "usb", channels: 8, signal: 3, battery: null },
  { id: "actichamp", name: "actiCHamp Plus", interface: "lsl", channels: 64, signal: 3, battery: null },
];

export function ConnectDeviceButton() {
  const [open, setOpen] = useState(false);
  const [iface, setIface] = useState<Interface>("bluetooth");
  const [status, setStatus] = useState<Record<string, DeviceStatus>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const connectedCount = Object.values(status).filter((s) => s === "connected").length;

  const toggleDevice = (id: string) => {
    const current = status[id] ?? "idle";
    if (current === "connected" || current === "connecting") {
      setStatus((s) => ({ ...s, [id]: "idle" }));
      return;
    }
    setStatus((s) => ({ ...s, [id]: "connecting" }));
    window.setTimeout(() => {
      setStatus((s) => (s[id] === "connecting" ? { ...s, [id]: "connected" } : s));
    }, 900);
  };

  const visibleDevices = DEVICES.filter((d) => d.interface === iface);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-2xs font-semibold transition-colors ${
          connectedCount > 0
            ? "border-transparent bg-accent-wash text-accent-text"
            : "border-rule bg-surface text-ink-2 hover:text-ink"
        }`}
      >
        <PlugIcon connected={connectedCount > 0} />
        {connectedCount > 0 ? `${connectedCount} device${connectedCount > 1 ? "s" : ""} connected` : "Connect EEG device"}
      </button>

      {open ? (
        <div className="panel absolute right-0 top-[calc(100%+8px)] z-30 w-80 overflow-hidden">
          <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
            <h2 className="panel-title">Connect EEG device</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-3 hover:text-ink-2"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="border-b border-rule px-4 py-3">
            <span className="label">Interface</span>
            <nav className="mt-1.5 flex items-center gap-1 rounded-lg bg-well p-1" aria-label="Interface">
              {INTERFACES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIface(value)}
                  className={`flex-1 rounded-md px-2 py-1 text-2xs font-semibold transition-colors ${
                    iface === value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <ul className="max-h-64 overflow-y-auto">
            {visibleDevices.length === 0 ? (
              <li className="px-4 py-6 text-center text-2xs text-ink-3">No devices found on this interface.</li>
            ) : (
              visibleDevices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  status={status[device.id] ?? "idle"}
                  onToggle={() => toggleDevice(device.id)}
                />
              ))
            )}
          </ul>

          <p className="border-t border-rule bg-well px-4 py-2.5 text-2xs text-ink-3">
            Live acquisition isn&apos;t wired up in this build — every view replays Chennu et al. 2016
            recordings. This panel shows the intended pairing flow.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DeviceRow({
  device,
  status,
  onToggle,
}: {
  device: MockDevice;
  status: DeviceStatus;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
      <SignalBars bars={device.signal} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink">{device.name}</p>
        <p className="text-2xs text-ink-3">
          {device.channels} ch{device.battery !== null ? ` · ${device.battery}% battery` : " · wired"}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`shrink-0 rounded-md px-2.5 py-1 text-2xs font-semibold transition-colors ${
          status === "connected"
            ? "bg-accent-wash text-accent-text hover:bg-rule"
            : status === "connecting"
              ? "bg-well text-ink-3"
              : "bg-well text-ink-2 hover:text-ink"
        }`}
      >
        {status === "connected" ? "Disconnect" : status === "connecting" ? "Connecting…" : "Connect"}
      </button>
    </li>
  );
}

function SignalBars({ bars }: { bars: number }) {
  return (
    <span className="flex shrink-0 items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${i <= bars - 1 ? "bg-accent" : "bg-rule"}`}
          style={{ height: `${5 + i * 3}px` }}
        />
      ))}
    </span>
  );
}

function PlugIcon({ connected }: { connected: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-5 5v0a5 5 0 0 1-5-5V8ZM12 16v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {connected ? <circle cx="19" cy="5" r="3" fill="var(--accent)" /> : null}
    </svg>
  );
}
