import invariant from "./index113.js";
import { defaultModels, InferenceSession, FileUtils } from "./index11.js";
import { ModelBase } from "./index114.js";
class Recognition extends ModelBase {
  #dictionary;
  static async create({ models, onnxOptions = {}, ...restOptions }) {
    const recognitionPath = models?.recognitionPath || defaultModels?.recognitionPath;
    invariant(recognitionPath, "recognitionPath is required");
    const dictionaryPath = models?.dictionaryPath || defaultModels?.dictionaryPath;
    invariant(dictionaryPath, "dictionaryPath is required");
    const model = await InferenceSession.create(recognitionPath, onnxOptions);
    const dictionaryText = await FileUtils.read(dictionaryPath);
    const dictionary = [...dictionaryText.split("\n"), " "];
    return new Recognition({ model, options: restOptions }, dictionary);
  }
  constructor(options, dictionary) {
    super(options);
    this.#dictionary = dictionary;
  }
  async run(lineImages, { onnxOptions = {} } = {}) {
    const modelDatas = await Promise.all(
      // Detect text from each line image
      lineImages.map(async (lineImage, index) => {
        const image = await lineImage.image.resize({
          height: 48
        });
        this.debugImage(lineImage.image, `out9-line-${index}.jpg`);
        this.debugImage(image, `out9-line-${index}-resized.jpg`);
        const modelData = this.imageToInput(image, {
          // mean: [0.5, 0.5, 0.5],
          // std: [0.5, 0.5, 0.5],
        });
        return modelData;
      })
    );
    const allLines = [];
    for (const modelData of modelDatas) {
      const output = await this.runModel({ modelData, onnxOptions });
      const lines = await this.decodeText(output);
      allLines.unshift(...lines);
    }
    const result = calculateBox({ lines: allLines, lineImages });
    return result;
  }
  decodeText(output) {
    const data = output;
    const predLen = data.dims[2];
    const line = [];
    let ml = data.dims[0] - 1;
    for (let l = 0; l < data.data.length; l += predLen * data.dims[1]) {
      const predsIdx = [];
      const predsProb = [];
      for (let i = l; i < l + predLen * data.dims[1]; i += predLen) {
        const tmpArr = data.data.slice(i, i + predLen);
        const tmpMax = tmpArr.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
        const tmpIdx = tmpArr.indexOf(tmpMax);
        predsProb.push(tmpMax);
        predsIdx.push(tmpIdx);
      }
      line[ml] = decode(this.#dictionary, predsIdx, predsProb);
      ml--;
    }
    return line;
  }
}
function decode(dictionary, textIndex, textProb, isRemoveDuplicate) {
  const ignoredTokens = [0];
  const charList = [];
  const confList = [];
  for (let idx = 0; idx < textIndex.length; idx++) {
    if (textIndex[idx] in ignoredTokens) {
      continue;
    }
    {
      if (idx > 0 && textIndex[idx - 1] === textIndex[idx]) {
        continue;
      }
    }
    charList.push(dictionary[textIndex[idx] - 1]);
    if (textProb) {
      confList.push(textProb[idx]);
    } else {
      confList.push(1);
    }
  }
  let text = "";
  let mean = 0;
  if (charList.length) {
    text = charList.join("");
    let sum = 0;
    confList.forEach((item) => {
      sum += item;
    });
    mean = sum / confList.length;
  }
  return { text, mean };
}
function calculateBox({ lines, lineImages }) {
  let mainLine = lines;
  const box = lineImages;
  for (const i in mainLine) {
    const b = box[mainLine.length - Number(i) - 1].box;
    for (const p of b) {
      p[0] = p[0];
      p[1] = p[1];
    }
    mainLine[i]["box"] = b;
  }
  mainLine = mainLine.filter((x) => x.mean >= 0.5);
  mainLine = afAfRec(mainLine);
  return mainLine;
}
function afAfRec(lines) {
  const outputLines = [];
  const indexes = /* @__PURE__ */ new Map();
  for (const index in lines) {
    const box = lines[index].box;
    indexes.set(box, Number(index));
  }
  const groupedBoxes = groupBoxesByMidlineDifference([...indexes.keys()]);
  for (const boxes of groupedBoxes) {
    const texts = [];
    let mean = 0;
    for (const box of boxes) {
      const index = indexes.get(box);
      if (index === void 0) {
        continue;
      }
      const line = lines[index];
      texts.push(line.text);
      mean += line.mean;
    }
    let outputBox = void 0;
    if (boxes.at(0) && boxes.at(-1)) {
      outputBox = [boxes.at(0)[0], boxes.at(-1)[1], boxes.at(-1)[2], boxes.at(0)[3]];
    }
    outputLines.push({
      mean: mean / boxes.length,
      text: texts.join(" "),
      box: outputBox
    });
  }
  return outputLines;
}
function calculateAverageHeight(boxes) {
  let totalHeight = 0;
  for (const box of boxes) {
    const [[, y1], , [, y2]] = box;
    const height = y2 - y1;
    totalHeight += height;
  }
  return totalHeight / boxes.length;
}
function groupBoxesByMidlineDifference(boxes) {
  const averageHeight = calculateAverageHeight(boxes);
  const result = [];
  for (const box of boxes) {
    const [[, y1], , [, y2]] = box;
    const midline = (y1 + y2) / 2;
    const group = result.find((b) => {
      const [[, groupY1], , [, groupY2]] = b[0];
      const groupMidline = (groupY1 + groupY2) / 2;
      return Math.abs(groupMidline - midline) < averageHeight / 2;
    });
    if (group) {
      group.push(box);
    } else {
      result.push([box]);
    }
  }
  for (const group of result) {
    group.sort((a, b) => {
      const [ltA] = a;
      const [ltB] = b;
      return ltA[0] - ltB[0];
    });
  }
  result.sort((a, b) => a[0][0][1] - b[0][0][1]);
  return result;
}
export {
  Recognition
};
//# sourceMappingURL=index76.js.map
