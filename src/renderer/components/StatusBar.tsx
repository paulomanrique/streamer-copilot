interface StatusBarProps {
  activeProfileName: string;
  obsConnected: boolean;
}

export function StatusBar({ activeProfileName, obsConnected }: StatusBarProps) {
  return (
    <footer className="h-8 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-4 shrink-0 text-xs text-gray-500">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-purple-500 pulse-dot" />
        <span>
          Twitch: <span className="text-gray-300">mychannel</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500 pulse-dot" />
        <span>
          YT Horizontal: <span className="text-gray-300">My Channel</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-rose-400 pulse-dot" />
        <span>
          YT Vertical: <span className="text-gray-300">My Channel Shorts</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-500 pulse-dot" />
        <span>
          Kick: <span className="text-gray-300">mychannel</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-pink-500" />
        <span>
          TikTok: <span className="text-gray-300">Planned</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <span className={`w-2 h-2 rounded-full ${obsConnected ? 'bg-cyan-500' : 'bg-gray-600'}`} />
        <span>
          OBS: <span className="text-gray-300">{obsConnected ? 'Connected' : 'Offline'}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-violet-500" />
        <span>
          Profile: <span className="text-gray-300">{activeProfileName}</span>
        </span>
      </div>
      <div className="ml-auto">v0.1.0-mockup</div>
    </footer>
  );
}
