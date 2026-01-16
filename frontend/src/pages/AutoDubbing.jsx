/**
 * AutoDubbing Placeholder Component
 * 
 * Future feature: Auto-dubbing integration for influencer content
 * This will provide automated dubbing/voiceover capabilities
 */

export default function AutoDubbing() {
  return (
    <div className="p-6">
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        {/* Construction Icon */}
        <div className="text-6xl mb-4">🚧</div>
        
        {/* Coming Soon Badge */}
        <div className="inline-flex items-center px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-full text-sm font-medium mb-4">
          <span className="mr-2">⏳</span>
          Coming Soon
        </div>
        
        {/* Title */}
        <h1 className="text-2xl font-bold text-theme-primary mb-2">
          Auto-dubbing Integration
        </h1>
        
        {/* Description */}
        <p className="text-theme-secondary max-w-md mb-6">
          Automatically generate multilingual voiceovers for your influencer content.
          This feature will integrate with AI-powered dubbing services to help you
          reach international audiences with localized video content.
        </p>
        
        {/* Feature Preview List */}
        <div className="bg-theme-surface rounded-lg border border-theme p-6 max-w-sm w-full">
          <h3 className="text-sm font-semibold text-theme-secondary uppercase tracking-wider mb-4">
            Planned Features
          </h3>
          <ul className="space-y-3 text-left">
            <li className="flex items-start">
              <span className="text-accent mr-2">•</span>
              <span className="text-theme-secondary text-sm">
                AI-powered voice cloning for natural-sounding dubs
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-accent mr-2">•</span>
              <span className="text-theme-secondary text-sm">
                Support for 20+ languages including Spanish, German, Japanese
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-accent mr-2">•</span>
              <span className="text-theme-secondary text-sm">
                Batch processing for multiple videos
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-accent mr-2">•</span>
              <span className="text-theme-secondary text-sm">
                Lip-sync adjustment for professional results
              </span>
            </li>
          </ul>
        </div>
        
        {/* Stay Tuned Note */}
        <p className="text-xs text-theme-tertiary mt-6">
          Stay tuned for updates! We're working hard to bring this feature to you.
        </p>
      </div>
    </div>
  );
}
