import { describe, expect, it } from "vitest";
import { defaultRadioVisualizer, isRadioVisualizerId, radioVisualizerFilter, radioVisualizerPresets } from "@/lib/radio-visualizers";
import { visualizerPackagerArgs } from "@/lib/radio-hls";

describe("Radio visualizer presets", () => {
  it("defines exactly ten stable unique presets", () => {
    expect(radioVisualizerPresets).toHaveLength(10);
    expect(new Set(radioVisualizerPresets.map((preset) => preset.id)).size).toBe(10);
    expect(isRadioVisualizerId(defaultRadioVisualizer)).toBe(true);
    expect(isRadioVisualizerId("unknown")).toBe(false);
  });

  it.each(radioVisualizerPresets)("builds an audio-preserving filter graph for $id", (preset) => {
    const filter = radioVisualizerFilter(preset.id);
    expect(filter).toContain("[0:a:0]asplit=2[viz][audio]");
    expect(filter).toContain("[video]");
    expect(visualizerPackagerArgs("/tmp/visual", 4, preset.id)).toEqual(expect.arrayContaining(["-map", "[video]", "-map", "[audio]", "libx264", "aac"]));
  });
});
