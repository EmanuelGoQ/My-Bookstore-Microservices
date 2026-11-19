import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createWriteStream } from "node:fs";

// Per-service clickstream file writer. Every service writes the identical line
// to stdout AND (optionally) to a file. In EKS the Fluent Bit DaemonSet tails
// each pod's stdout, so the file is optional; it is kept behind a flag for
// parity with the original design and for local/sidecar scenarios.
export const createClickstreamFileWriter = ({ enabled, path, logger }) => {
  let stream = null;
  let fileAvailable = false;

  const initialize = async () => {
    if (!enabled) {
      return;
    }

    const directory = dirname(path);
    await mkdir(directory, { recursive: true });

    stream = createWriteStream(path, { flags: "a", encoding: "utf8" });

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        stream.off("open", handleOpen);
        stream.off("error", handleError);
      };

      const handleOpen = () => {
        cleanup();
        fileAvailable = true;
        resolve();
      };

      const handleError = (error) => {
        cleanup();
        reject(error);
      };

      stream.once("open", handleOpen);
      stream.once("error", handleError);
    });

    stream.on("error", (error) => {
      fileAvailable = false;
      logger.error("Clickstream file writer failed", { path, error: error.message });
    });

    logger.info("Clickstream file writer initialized", { path });
  };

  const writeLine = (line) => {
    if (!enabled || !stream || !fileAvailable) {
      return;
    }

    stream.write(`${line}\n`);
  };

  const close = async () => {
    if (!stream) {
      return;
    }

    const streamToClose = stream;
    stream = null;
    fileAvailable = false;

    await new Promise((resolve) => {
      streamToClose.end(resolve);
    });
  };

  return { initialize, writeLine, close };
};
