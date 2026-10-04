"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface DecryptedTextProps {
  text: string;
  speed?: number; // ms per frame
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: "start" | "end" | "center";
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: "view" | "hover" | "mount";
}

const DEFAULT_CHARS = "ABCDEF0123456789_#@!<>{}[]=+-*&%";

export function DecryptedText({
  text,
  speed = 40,
  maxIterations = 10,
  sequential = true,
  characters = DEFAULT_CHARS,
  className = "",
  parentClassName = "",
  encryptedClassName = "text-[var(--color-wb-accent)] font-mono opacity-80",
  animateOn = "mount",
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovered, setIsHovered] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const triggerAnimation = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    let iteration = 0;
    const totalChars = text.length;

    intervalRef.current = setInterval(() => {
      setDisplayText(() => {
        return text
          .split("")
          .map((char, index) => {
            if (char === " " || char === "\n") return char;

            if (sequential) {
              const progress = Math.floor((iteration / (maxIterations * 2)) * totalChars);
              if (index < progress) {
                return char;
              }
            } else {
              if (iteration >= maxIterations) {
                return char;
              }
            }

            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join("");
      });

      iteration += 1;

      if (iteration > maxIterations * 2 + 5) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplayText(text);
      }
    }, speed);
  }, [text, speed, maxIterations, sequential, characters]);

  useEffect(() => {
    if (animateOn === "mount" && !hasAnimated) {
      triggerAnimation();
      setHasAnimated(true);
    }
  }, [animateOn, hasAnimated, triggerAnimation]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (animateOn === "hover") {
      setIsHovered(true);
      triggerAnimation();
    }
  };

  const handleMouseLeave = () => {
    if (animateOn === "hover") {
      setIsHovered(false);
    }
  };

  return (
    <span
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn("inline-block", parentClassName)}
    >
      <span className={cn(className)}>
        {displayText.split("").map((char, i) => {
          const isOriginal = char === text[i];
          return (
            <span
              key={i}
              className={cn(
                "transition-colors duration-100",
                !isOriginal && encryptedClassName,
              )}
            >
              {char}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export default DecryptedText;
