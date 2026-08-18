export interface VideoProcessor {
  process(inputKey: string, outputKey: string): Promise<{ hlsPath: string; thumbnailUrl: string }>;
}
export class PassThroughVideoProcessor implements VideoProcessor {
  async process(inputKey: string, outputKey: string) {
    return { hlsPath: inputKey, thumbnailUrl: `/media/${outputKey}.jpg` };
  }
}
// TODO: replace with MediaConvert/ffmpeg and subject-tracking smart crop workers.
