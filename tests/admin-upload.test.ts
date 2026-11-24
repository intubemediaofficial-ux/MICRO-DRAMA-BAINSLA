import { describe, expect, it } from "vitest";
import { parseEpisodeNumber, planEpisodeNumbers } from "@/lib/admin-upload";

function file(name: string) {
  return { name } as File;
}

describe("admin video upload helpers", () => {
  it("parses the supported filename patterns and ignores arbitrary names", () => {
    const examples: [string, number | null][] = [
    ["dayaramfouji_1782805282_….mp4", null],
    ["Virasat EP 05.mp4", 5],
    ["12.mp4", 12],
    ["E07_final.mov", 7],
    ["part-3.mp4", 3],
    ];
    for (const [filename, expected] of examples) {
      expect(parseEpisodeNumber(filename)).toBe(expected);
    }
  });

  it("natural-sorts files and allocates free numbers around collisions and duplicates", () => {
    const planned = planEpisodeNumbers(
      [
        file("Episode 10.mp4"),
        file("Episode 2.mp4"),
        file("Episode 2 Final.mp4"),
        file("part-3.mp4"),
      ],
      [1],
    );
    expect(planned.map(({ file: item, number }) => [item.name, number])).toEqual([
      ["Episode 2 Final.mp4", 2],
      ["Episode 2.mp4", 3],
      ["Episode 10.mp4", 10],
      ["part-3.mp4", 11],
    ]);
  });

  it("uses the next free series number when a parsed number is already used", () => {
    expect(
      planEpisodeNumbers([file("EP 05.mp4"), file("EP 05 copy.mp4")], [1, 2, 5]).map(
        ({ file: item, number }) => [item.name, number],
      ),
    ).toEqual([
      ["EP 05 copy.mp4", 6],
      ["EP 05.mp4", 7],
    ]);
  });
});
