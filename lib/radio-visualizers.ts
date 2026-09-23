export const radioVisualizerIds = ["oscilloscope", "mirrored-wave", "dot-wave", "spectrum-bars", "spectrum-lines", "spectrum-fire", "spectrogram-scroll", "spectrogram-rain", "vector-orbit", "vector-polar"] as const;

export const radioVisualizerPresets = [
  { id: "oscilloscope", name: "Oscilloscope", description: "A clean stereo waveform drawn across the signal." },
  { id: "mirrored-wave", name: "Mirrored Wave", description: "A centered waveform that expands in both directions." },
  { id: "dot-wave", name: "Dot Wave", description: "Audio samples rendered as a field of moving points." },
  { id: "spectrum-bars", name: "Spectrum Bars", description: "Logarithmic frequency bars driven by the current mix." },
  { id: "spectrum-lines", name: "Spectrum Lines", description: "Fine frequency lines for a technical analyzer look." },
  { id: "spectrum-fire", name: "Spectrum Fire", description: "Warm frequency bars with a red and amber palette." },
  { id: "spectrogram-scroll", name: "Spectrogram Scroll", description: "A continuously scrolling frequency history." },
  { id: "spectrogram-rain", name: "Spectrogram Rain", description: "A vivid rainbow spectrogram moving with the signal." },
  { id: "vector-orbit", name: "Vector Orbit", description: "A stereo Lissajous scope showing channel movement." },
  { id: "vector-polar", name: "Vector Polar", description: "A circular stereo vectorscope for spatial motion." },
] as const;

export type RadioVisualizerId = (typeof radioVisualizerIds)[number];
export type RadioVisualMode = "COVER" | "VISUALIZER";

export const defaultRadioVisualizer: RadioVisualizerId = "mirrored-wave";

export function isRadioVisualizerId(value: string): value is RadioVisualizerId {
  return radioVisualizerPresets.some((preset) => preset.id === value);
}

export function radioVisualizerFilter(id: RadioVisualizerId): string {
  const filters: Record<RadioVisualizerId, string> = {
    "oscilloscope": "[viz]aformat=sample_fmts=s16,showwaves=s=1280x720:mode=line:rate=30:colors=#ff554d|#f5b56b",
    "mirrored-wave": "[viz]aformat=sample_fmts=s16,showwaves=s=1280x720:mode=cline:rate=30:colors=#e66a5f|#e7b16f",
    "dot-wave": "[viz]aformat=sample_fmts=s16,showwaves=s=1280x720:mode=point:rate=30:colors=#ff7067|#ffd080",
    "spectrum-bars": "[viz]showfreqs=s=1280x720:mode=bar:fscale=log:ascale=log:rate=30:colors=#ff453a|#ffb45e",
    "spectrum-lines": "[viz]showfreqs=s=1280x720:mode=line:fscale=log:ascale=sqrt:rate=30:colors=#ff6b63|#f5d28a",
    "spectrum-fire": "[viz]showfreqs=s=1280x720:mode=bar:fscale=log:ascale=cbrt:rate=30:colors=#ff1f1f|#ff7a18|#ffd166",
    "spectrogram-scroll": "[viz]showspectrum=s=1280x720:mode=combined:color=intensity:scale=log:slide=scroll:fps=30",
    "spectrogram-rain": "[viz]showspectrum=s=1280x720:mode=combined:color=rainbow:scale=log:slide=scroll:fps=30",
    "vector-orbit": "[viz]avectorscope=s=1280x720:mode=lissajous:draw=line:scale=lin:zoom=1.5:r=30",
    "vector-polar": "[viz]avectorscope=s=1280x720:mode=polar:draw=line:scale=lin:zoom=1.5:r=30",
  };
  return `[0:a:0]asplit=2[viz][audio];${filters[id]},fps=30,format=yuv420p,setsar=1[video]`;
}
