"use client";

import { useEffect, useRef, useState } from "react";

export interface TerminalLog {
  id: string;
  timestamp: string;
  text: string;
  type: "system" | "thought" | "error";
}

interface TerminalProps {
  logs: TerminalLog[];
  personaName: string;
  asciiArt?: string;
  isStreaming?: boolean;
}

const DEFAULT_ASCII = `
    ___   _________________   ________  ___ 
   /   | / ____/ ____/  _/ | / /_  __/ /   |
  / /| |/ / __/ __/  / //  |/ / / /   / /| |
 / ___ / /_/ / /___ / // /|  / / /   / ___ |
/_/  |_\\____/_____/___/_/ |_/ /_/   /_/  |_|
                                            
`;

export function Terminal({ logs, personaName, asciiArt = DEFAULT_ASCII, isStreaming = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayedLogs, setDisplayedLogs] = useState<TerminalLog[]>([]);

  useEffect(() => {
    setDisplayedLogs(logs);
  }, [logs]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedLogs]);

  return (
    <div className="terminal-container" ref={containerRef}>
      <div className="terminal-header">
        {asciiArt}
        {"\n"}
        INITIALIZING SYSTEM...
        {"\n"}
        AUTHENTICATING PROTOCOL: {personaName}
        {"\n"}
        STATUS: ONLINE
        {"\n"}
        ====================================================
      </div>

      <div className="terminal-body">
        {displayedLogs.map((log) => (
          <div key={log.id} className="terminal-line">
            <span className="terminal-timestamp">[{log.timestamp}]</span>
            <span className={`terminal-content ${log.type}`}>{log.text}</span>
          </div>
        ))}
        {isStreaming && (
          <div className="terminal-line">
            <span className="terminal-timestamp">[{new Date().toISOString().split("T")[1].substring(0, 8)}]</span>
            <span className="terminal-content system">
              AWAITING INPUT<span className="terminal-cursor"></span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
