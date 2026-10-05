type LogMedia = {
  type: "image" | "video";
  src: string;
  caption: string;
};

const mediaTypes = [
  {
    dir: "img",
    type: "image" as const,
  },
  {
    dir: "vid",
    type: "video" as const,
  },
];

export function generateLogMedia(
  logName: string,
  files: {
    name: string;
    type: "image" | "video";
  }[],
): LogMedia[] {
  if (!logName) {
    throw new Error("ログ名を指定してください");
  }

  const media: LogMedia[] = [];

  for (const file of files) {
    const dir = mediaTypes.find((item) => item.type === file.type)?.dir;

    if (!dir) {
      continue;
    }

    media.push({
      type: file.type,
      src: `/logs/${logName}/${dir}/${file.name}`,
      caption: "",
    });
  }

  return media;
}
