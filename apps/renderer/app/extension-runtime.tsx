'use client';

import React, { useEffect, useState } from 'react';

type CountdownRuntimeProps = {
  label: string;
  targetAt: string;
};

export function ExtensionRuntimeBootstrap({
  runtimeIds,
}: {
  runtimeIds: readonly string[];
}) {
  useEffect(() => {
    const detail = { runtimeIds: [...runtimeIds] };
    window.dispatchEvent(new CustomEvent('page.loaded', { detail }));
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('page.rendered', { detail }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [runtimeIds]);

  return null;
}

export function CountdownRuntime({ label, targetAt }: CountdownRuntimeProps) {
  const [remaining, setRemaining] = useState(() => formatRemaining(targetAt));

  useEffect(() => {
    const update = () => setRemaining(formatRemaining(targetAt));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [targetAt]);

  return (
    <div data-extension-runtime="countdown.runtime">
      <span>{label}</span> <time dateTime={targetAt}>{remaining}</time>
    </div>
  );
}

function formatRemaining(targetAt: string): string {
  const milliseconds = Math.max(0, new Date(targetAt).getTime() - Date.now());
  const seconds = Math.floor(milliseconds / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${rest}s`;
}
