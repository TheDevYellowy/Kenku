const os = require("node:os");
const fs = require("node:fs");
const shell = require("shelljs");
const pass = [".", ",", "...", "-"];
const ffmpeg = require("fluent-ffmpeg");

const models = fs.readdirSync(`./whisper`).filter((s) => s.endsWith(".bin"));
const tests = fs.readdirSync("./test");
const wavFile = "test";

async function main() {
  for (const test of tests) {
    fs.rmSync(`./test/${test}`, { recursive: true });
  }
  console.log(
    `[test.js] Starting test for the following models:\n${models.join("\n")}`
  );
  for (const model of models) {
    await test(model);
  }
}

main();

/**
 * @param {string} model
 * @returns {Promise<void>}
 */
async function test(model) {
  return new Promise((resolve, reject) => {
    console.log(`[${model}] Starting test`);
    const start = Date.now();
    try {
      shell.exec(
        `"./whisper/main.exe" --language en -t ${Math.round(
          os.availableParallelism() / 2
        )} -sow true -ml 1 -m ./whisper/${model} -f ./${wavFile}.wav`,
        { silent: true, async: false },
        (code, stdout, stderr) => {
          const exec = Date.now();
          console.log(`[${model}] Finished whisper with code ${code}`);
          if (code == 0) {
            const lines = stdout.match(/\[[0-9:.]+\s-->\s[0-9:.]+\].*/g);
            if (lines == null) console.log({ lines, stdout, stderr });
            lines.shift();

            const formatted = lines.map((line) => {
              let [timestamp, speech] = line.split("]  ");
              timestamp = timestamp.substring(1);
              const [start, end] = timestamp.split(" --> ");
              speech = speech.replace(/\n/g, "");
              speech = speech.replace(" ", "");

              return { start, end, speech };
            });

            const format = Date.now();
            console.log(`[${model}] Finished formatting the output`);

            let i = 0;
            let copy = Array.from(formatted);
            let len = copy.length - 1;

            while (i < len) {
              const data = copy[i];
              if (pass.includes(data.speech)) {
                i++;
                continue;
              }
              if (data.speech.startsWith("'")) {
                const prefix = copy[i - 1];
                prefix.speech += data.speech;
                prefix.end = data.end;
                copy.splice(i, 1);
              }

              copy[i].speech = copy[i].speech.toLowerCase();

              len = copy.length - 1;
              i++;
            }

            const parse = Date.now();
            console.log(`[${model}] Finished parsing the formatted data`);

            if (!fs.existsSync(`./test/${model}/`))
              fs.mkdirSync(`./test/${model}`, { recursive: true });

            fs.writeFileSync(
              `./test/${model}/data.json`,
              JSON.stringify(copy, null, 2)
            );
            let words = [];
            for (const data of copy) {
              if (words.includes(data.speech)) return;
              try {
                ffmpeg(`./${wavFile}.wav`)
                  .inputOption([`-ss ${data.start}`, `-to ${data.end}`])
                  .output(`./test/${model}/${data.speech}.wav`)
                  .run();
              } catch (error) {
                console.error(
                  `[${model}] ffmpeg error: ${error} (${data.speech})`
                );
              }
            }
            words = Date.now();
            console.log(
              `[${model}] Finished test it took ${
                (Date.now() - start) / 1000
              } seconds total`
            );

            fs.writeFileSync(
              `./test/${model}/time.txt`,
              `-- Times taken to do the tasks --\nWhisper: ${
                (exec - start) / 1000
              } seconds\nFormat: ${(format - exec) / 1000} seconds\nParse: ${
                (parse - format) / 1000
              } seconds\nFfmpeg: ${(words - format) / 1000} seconds`
            );

            resolve();
          } else {
            console.error(
              `[${model}] Error while running the command: ${shell.error()} ( ${stderr} )`
            );
          }
        }
      );
    } catch (e) {
      console.error(e);
      reject();
    }
  });
}
