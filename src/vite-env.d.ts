/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Neither butterchurn package ships types; these cover the calls this project makes.
declare module 'butterchurn' {
  interface Visualizer {
    connectAudio(node: AudioNode): void;
    loadPreset(preset: object, blendSeconds: number): void;
    render(): void;
  }
  const butterchurn: {
    createVisualizer(
      ctx: AudioContext,
      canvas: HTMLCanvasElement,
      options: { width: number; height: number; pixelRatio?: number },
    ): Visualizer;
  };
  export default butterchurn;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsMinimal.min.js' {
  const presets: { getPresets(): Record<string, object> };
  export default presets;
}

/** Which build this is: the app (PWA) or the single file. Chooses storage and the service worker. */
declare const __PROFILE__: 'app' | 'html';
