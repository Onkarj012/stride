import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
  rotation: number;
}

const COLORS = ["#FF3B30", "#00FFFF", "#FFD700", "#32D74B", "#FF9500", "#BF5AF2", "#64D2FF"];

export function Confetti({ active, onDone }: { active: boolean; onDone?: () => void }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (active) {
      const newPieces: ConfettiPiece[] = Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.3,
        size: 6 + Math.random() * 8,
        rotation: Math.random() * 360,
      }));
      setPieces(newPieces);
      const timer = setTimeout(() => {
        setPieces([]);
        onDone?.();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [active, onDone]);

  return (
    <AnimatePresence>
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{
            opacity: 1,
            y: -20,
            x: `${p.x}vw`,
            rotate: 0,
            scale: 1,
          }}
          animate={{
            opacity: [1, 1, 0],
            y: ["-10vh", "30vh", "100vh"],
            x: [`${p.x}vw`, `${p.x + (Math.random() - 0.5) * 30}vw`, `${p.x + (Math.random() - 0.5) * 20}vw`],
            rotate: [0, p.rotation, p.rotation * 2],
            scale: [1, 1.2, 0.5],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 2 + Math.random(),
            delay: p.delay,
            ease: "easeOut",
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            zIndex: 9999,
            borderRadius: Math.random() > 0.5 ? "50%" : "0%",
          }}
        />
      ))}
    </AnimatePresence>
  );
}
