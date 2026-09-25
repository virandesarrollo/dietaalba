'use client';
import { useEffect } from 'react';
export function OfflineSupport() { useEffect(() => { if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/push-sw.js'); }, []); return null; }
