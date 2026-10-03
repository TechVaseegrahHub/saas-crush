import React from 'react';
import { motion } from 'motion/react';
import { Play, Sparkles, Trophy, BookOpen } from 'lucide-react';
import { GameMode } from '../types/game';
import { SAAS_PRODUCTS } from '../data/products';
import { SaaSLogo } from './SaaSLogo';
import techLogo from '../../assets/image/tech-logo.png';

interface LandingScreenProps {
  highScore: number;
  onStartGame: (mode: GameMode) => void;
  onProductPreviewClick: (productId: typeof SAAS_PRODUCTS[number]['id']) => void;
  onOpenCodex: () => void;
  onOpenLeaderboard: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  highScore,
  onStartGame,
  onProductPreviewClick,
  onOpenCodex,
  onOpenLeaderboard,
}) => {
  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-5xl flex-col items-center justify-between gap-8 px-4 py-4 text-center z-10 sm:min-h-[80vh] sm:px-6 sm:py-6">
      {/* Hero Header */}
      <div className="relative z-10 my-auto flex w-full flex-col items-center gap-6 pt-2 sm:pt-4">
        {/* Company Logo / Expo Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-full border border-[#d9e8df] bg-[#f5fff8] px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black backdrop-blur-md sm:text-xs"
        >
          <span>TECH EXPO 2026 OFFICIAL SHOWCASE</span>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="space-y-3"
        >
          <h1 className="text-3xl font-black uppercase leading-none tracking-tight text-black sm:text-6xl sm:leading-tight">
            Tech Expo <span className="text-black">SaaS Crush</span>
          </h1>
          <p className="mx-auto max-w-xl text-xs font-bold uppercase tracking-widest text-black/60 sm:text-sm">
            Match Enterprise Solutions - Unlock SaaS Intelligence
          </p>
        </motion.div>

        {/* 7 SaaS App Icon Preview Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-2.5 py-2 sm:gap-4 sm:py-3"
        >
          {SAAS_PRODUCTS.map((prod) => (
            <button
              type="button"
              key={prod.id}
              onClick={() => onProductPreviewClick(prod.id)}
              title={`${prod.name} - ${prod.tagline}`}
              className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[#d9e8df] bg-[#f5fff8] p-2.5 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:border-[#1b9e4b] sm:h-[72px] sm:w-[72px] sm:p-3"
            >
              <SaaSLogo id={prod.id} size={50} glow={true} />
            </button>
          ))}
        </motion.div>

        {/* Play CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid w-full max-w-md grid-cols-1 gap-3 pt-4"
        >
          <button
            onClick={() => onStartGame('timed')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1b9e4b] px-8 py-4 text-xs font-bold uppercase tracking-widest text-black shadow-2xl transition-colors hover:bg-[#17903f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4 fill-black" />
            <span>60s Expo Blitz</span>
          </button>

        </motion.div>

        {/* Secondary Navigation */}
        <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row sm:gap-6">
          <button
            onClick={onOpenCodex}
            className="flex min-h-10 items-center gap-1.5 rounded-md border border-[#d9e8df] bg-[#f5fff8] px-3 py-2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-[#e6f8e6]"
          >
            <BookOpen className="h-4 w-4 text-black" /> Explore 7 SaaS Specs
          </button>

          <button
            onClick={onOpenLeaderboard}
            className="flex min-h-10 items-center gap-1.5 rounded-md border border-[#d9e8df] bg-[#f5fff8] px-3 py-2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-[#e6f8e6]"
          >
            <Trophy className="h-4 w-4 text-black" /> Best: {highScore.toLocaleString()}
          </button>
        </div>
      </div>

      {/* Expo Footer Info */}
      <div className="relative z-10 flex w-full flex-col items-center justify-between gap-2 border-t border-[#d9e8df] pt-6 text-center text-[10px] font-bold uppercase tracking-widest text-black/60 sm:flex-row sm:text-left">
        <span>2026 Tech Expo Enterprise Systems</span>
        <img src={techLogo} alt="Powered by Tech Vaseegrah" className="h-8 w-auto object-contain" />
      </div>
    </div>
  );
};
