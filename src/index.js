import React, { useLayoutEffect, useState } from "react";
import ReactDOM from "react-dom";

import rough from "roughjs/bundled/rough.esm";

const canvasId = "canvas";
const generator = rough.generator();

class Tool {
  constructor(color = null) {
    this.color = color;
  }
  config(callback) {
    return "no config for this tool";
  }
  apply(input) {
    return [];
  }
  computeDimensions(position) {
    const width = 50;
    const offset = 100;
    const minY = 100;
    const height = 250;
    const minX = position * width * 4 + offset;
    const maxX = minX + width;
    const maxY = minY + height;
    const sinkMinX = (position + 1) * width * 4 + offset;
    return { minX, minY, width, height, sinkMinX, maxX, maxY };
  }
  isInside(position, clientX, clientY) {
    const { minX, minY, maxX, maxY } = this.computeDimensions(position);
    return (
      clientX >= minX && clientX <= maxX && clientY >= minY && clientY <= maxY
    );
  }
  computeColor(line) {
    if (!line) {
      return "#000000";
    }
    const avgDarkness = Math.ceil(
      line
        .split("")
        .map((letter) =>
          Math.min(
            10 * Math.max(letter.charCodeAt(0) - "a".charCodeAt(0), 0),
            255
          )
        )
        .reduce((a, b) => a + b) / line.length
    );
    const hexDarkness = Number(avgDarkness).toString(16);
    return "#" + hexDarkness + hexDarkness + hexDarkness;
  }
  getOutputLine(position, line, index, outputSpacing) {
    const { minX, minY, width, sinkMinX } = this.computeDimensions(position);
    this.computeColor(line);
    const y = minY + (index + 1) * outputSpacing;
    return generator.line(minX + width, y, sinkMinX, y, {
      strokeWidth: 5,
      stroke: this.computeColor(line),
    });
  }
  getElements(position, output, highlight = false) {
    const { minX, minY, width, height } = this.computeDimensions(position);
    const elements = [
      generator.rectangle(minX, minY, width, height, {
        fill: this.color,
        strokeWidth: highlight ? 5 : 1,
      }),
    ];
    if (output) {
      const outputSpacing = Math.ceil(height / output.length / 2);
      output.forEach((line, index) =>
        elements.push(this.getOutputLine(position, line, index, outputSpacing))
      );
    }
    return elements;
  }
}

class Cat extends Tool {
  constructor(text) {
    super("purple");
    this.text = text;
  }
  config(callback) {
    return (
      <div>
        <textarea id="toolConfig" placeholder={this.text} required />
        <button
          onClick={() =>
            callback(new Cat(document.getElementById("toolConfig").value))
          }
        >
          Update Cat
        </button>
      </div>
    );
  }
  apply(input) {
    if (input === null) {
      input = this.text;
    }
    return input.split("\n");
  }
}

class XArgs extends Tool {
  constructor(n = null) {
    super("green");
    this.n = n;
  }
  config(callback) {
    return (
      <div>
        <input
          type="number"
          min="1"
          id="toolConfig"
          placeholder={this.n}
          required
        />
        <button
          onClick={() =>
            callback(
              new XArgs(parseInt(document.getElementById("toolConfig").value))
            )
          }
        >
          Update XArgs
        </button>
      </div>
    );
  }
  apply(input) {
    const rebatchedLines = [];
    if (input) {
      const words = [];
      input.forEach((line) => words.push(...line.trim().split(/\s+/)));
      const n = this.n ? this.n : words.length;
      for (let i = 0; i < words.length; i += n) {
        rebatchedLines.push(words.slice(i, i + n).join(" "));
      }
    }
    return rebatchedLines;
  }
}

class Grep extends Tool {
  constructor(regex) {
    super("blue");
    this.regex = new RegExp(regex);
  }
  config(callback) {
    return (
      <div>
        <input type="text" id="toolConfig" placeholder={this.regex} required />
        <button
          onClick={() =>
            callback(new Grep(document.getElementById("toolConfig").value))
          }
        >
          Update Grep
        </button>
      </div>
    );
  }
  apply(input) {
    return input ? input.filter((line) => this.regex.test(line)) : [];
  }
}

class Sink extends Tool {
  constructor() {
    super(null);
  }
}

const App = () => {
  const defaultInput =
    "ONCE when I saw a cripple\nGasping slowly his last days with the white plague,\nLooking from hollow eyes, calling for air,\nDesperately gesturing with wasted hands\nIn the dark and dust of a house down in a slum,\nI said to myself\nI would rather have been a tall sunflower\nLiving in a country garden\nLifting a golden-brown face to the summer,\nRain-washed and dew-misted,\nMixed with the poppies and ranking hollyhocks,\nAnd wonderingly watching night after night\nThe clear silent processionals of stars.";
  const [pipeline, setPipeline] = useState([
    new Cat(defaultInput),
    new XArgs(15),
    new Grep(","),
    new XArgs(6),
    new Sink(),
  ]);
  const [highlightedTool, setHighlightedTool] = useState(0);
  const [inputLines, setInputLines] = useState([]);
  const [outputLines, setOutputLines] = useState(defaultInput.split("\n"));

  const updatePipeline = (position, tool) => {
    const pipelineCopy = [...pipeline];
    pipelineCopy[position] = tool;
    setPipeline(pipelineCopy);
  };

  useLayoutEffect(() => {
    const canvas = document.getElementById(canvasId);
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    const roughCanvas = rough.canvas(canvas);
    let lines = null;
    if (highlightedTool === 0) {
      setInputLines([]);
    } else if (highlightedTool === pipeline.length) {
      setOutputLines([]);
    }
    for (let i = 0; i < pipeline.length; i++) {
      const tool = pipeline[i];
      lines = tool.apply(lines);
      tool
        .getElements(i, lines, highlightedTool === i ? true : false)
        .forEach((element) => roughCanvas.draw(element));
      if (i === highlightedTool - 1) {
        setInputLines(lines);
      } else if (i === highlightedTool) {
        setOutputLines(lines);
      }
    }
  }, [pipeline, highlightedTool]);

  const handlePointerDown = (event) => {};
  const handlePointerMove = (event) => {};
  const handlePointerUp = (event) => {
    const { clientX, clientY } = event;
    for (let i = 0; i < pipeline.length; i++) {
      if (pipeline[i].isInside(i, clientX, clientY)) {
        setHighlightedTool(i);
      }
    }
  };

  return (
    <div>
      <div style={{ position: "fixed" }}>Pipeline Visualization:</div>
      <div style={{ position: "fixed", bottom: 0, padding: 100 }}>
        {pipeline[highlightedTool].config((tool) =>
          updatePipeline(highlightedTool, tool)
        )}

        <div style={{ float: "left" }}>
          input lines
          <ul>
            {inputLines.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
        <div style={{ float: "right" }}>
          output lines
          <ul>
            {outputLines.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <canvas
          id={canvasId}
          width={window.innerWidth}
          height={window.innerHeight}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          Canvas
        </canvas>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
