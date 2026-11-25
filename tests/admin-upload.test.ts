import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseEpisodeNumber,
  planEpisodeNumbers,
  uploadEpisodeVideo,
} from "@/lib/admin-upload";

afterEach(() => vi.unstubAllGlobals());

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

  it.each([
    ["video/mp4", "video/mp4"],
    ["application/pdf", "application/octet-stream"],
    ["", "application/octet-stream"],
  ])("uses a safe upload content type for %s", async (fileType, expectedType) => {
    class MockXMLHttpRequest {
      static instance: MockXMLHttpRequest;
      upload = {};
      headers: Record<string, string> = {};
      status = 202;
      responseText = JSON.stringify({ episode: { id: "episode-1" } });
      onload: (() => void) | null = null;

      constructor() {
        MockXMLHttpRequest.instance = this;
      }

      open() {}

      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }

      send() {}
    }

    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const request = uploadEpisodeVideo(
      "episode-1",
      { name: "clip.mp4", type: fileType } as File,
      { publish: false },
    );

    expect(MockXMLHttpRequest.instance.headers["content-type"]).toBe(expectedType);
    MockXMLHttpRequest.instance.onload?.();
    await expect(request).resolves.toMatchObject({ id: "episode-1" });
  });
});
