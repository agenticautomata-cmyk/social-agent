'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_TRACK_ID } from './benson-studio-tracks';

type BensonStudioContextValue = {
  musicPlaying: boolean;
  setMusicPlaying: (playing: boolean) => void;
  bensonWorking: boolean;
  setBensonWorking: (working: boolean) => void;
  isDancing: boolean;
  shuffleEnabled: boolean;
  setShuffleEnabled: (enabled: boolean) => void;
  activeTrackId: string;
  setActiveTrackId: (id: string) => void;
  activeTrackLabel: string;
  setActiveTrackLabel: (label: string) => void;
};

const BensonStudioContext = createContext<BensonStudioContextValue | null>(null);

export function BensonStudioProvider({ children }: { children: ReactNode }) {
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [bensonWorking, setBensonWorking] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  const [activeTrackId, setActiveTrackId] = useState(DEFAULT_TRACK_ID);
  const [activeTrackLabel, setActiveTrackLabel] = useState('Top of the feed');

  const isDancing = musicPlaying || bensonWorking;

  const value = useMemo(
    () => ({
      musicPlaying,
      setMusicPlaying,
      bensonWorking,
      setBensonWorking,
      isDancing,
      shuffleEnabled,
      setShuffleEnabled,
      activeTrackId,
      setActiveTrackId,
      activeTrackLabel,
      setActiveTrackLabel,
    }),
    [
      musicPlaying,
      bensonWorking,
      isDancing,
      shuffleEnabled,
      activeTrackId,
      activeTrackLabel,
    ],
  );

  return (
    <BensonStudioContext.Provider value={value}>{children}</BensonStudioContext.Provider>
  );
}

export function useBensonStudio() {
  const ctx = useContext(BensonStudioContext);
  if (!ctx) {
    return {
      musicPlaying: false,
      setMusicPlaying: () => {},
      bensonWorking: false,
      setBensonWorking: () => {},
      isDancing: false,
      shuffleEnabled: true,
      setShuffleEnabled: () => {},
      activeTrackId: DEFAULT_TRACK_ID,
      setActiveTrackId: () => {},
      activeTrackLabel: 'Top of the feed',
      setActiveTrackLabel: () => {},
    };
  }
  return ctx;
}
