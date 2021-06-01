import React, { useEffect, useLayoutEffect, useState } from "react";
import ReactDOM from "react-dom";

import rough from "roughjs/bundled/rough.esm";

const canvasId = "canvas";
const generator = rough.generator();

const closeDist = 10;
const roughness = 0;
const bowing = 0;
const clearMeta = { roughness: roughness, bowing: bowing };
const redMeta = { fill: "red", roughness: roughness, bowing: bowing };
const blueMeta = { fill: "blue", roughness: roughness, bowing: bowing };
const yellowMeta = { fill: "yellow", roughness: roughness, bowing: bowing };

const useHistory = (initialState) => {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([initialState]);

  const setState = (action, overwrite: boolean = false) => {
    const newState =
      typeof action === "function" ? action(history[index]) : action;
    if (overwrite) {
      const nextHistory = [...history];
      nextHistory[index] = newState;
      setHistory(nextHistory);
    } else {
      const updatedState = [...history].slice(0, index + 1);
      setHistory([...updatedState, newState]);
      setIndex((prevState) => prevState + 1);
    }
  };

  const undo = () => setIndex((prevState) => Math.max(prevState - 1, 0));
  const redo = () =>
    setIndex((prevState) => Math.min(prevState + 1, history.length - 1));

  return [history[index], setState, undo, redo];
};

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
    const { minX, minY, width, height, sinkMinX } =
      this.computeDimensions(position);
    this.computeColor(line);
    const y = minY + (index + 1) * outputSpacing;
    return generator.line(minX + width, y, sinkMinX, y, {
      strokeWidth: 5,
      stroke: this.computeColor(line),
    });
  }
  getElements(position, output, highlight = false) {
    const { minX, minY, width, height, sinkMinX } =
      this.computeDimensions(position);
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
            callback(new XArgs(document.getElementById("toolConfig").value))
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

class Element {
  constructor(index, klass, x1, y1, x2, y2, meta) {
    this.index = index;
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.meta = meta;
    this.klass = klass;
  }
  move(x, y) {
    const x1 = x;
    const y1 = y;
    const x2 = this.x2 - this.x1 + x;
    const y2 = this.y2 - this.y1 + y;
    return new this.klass(this.index, x1, y1, x2, y2, this.meta);
  }
  resize(x, y, anchor) {
    return new this.klass(this.index, x, y, anchor.x, anchor.y, this.meta);
  }
  redraw(x2, y2) {
    const { index, x1, y1 } = this;
    return new this.klass(index, x1, y1, x2, y2, this.meta);
  }
}

class Line extends Element {
  constructor(index, x1, y1, x2, y2, meta = null) {
    super(index, Line, x1, y1, x2, y2, meta);

    if (x1 < x2 || (x1 === x2 && y1 < y2)) {
      this.start = { x: x1, y: y1 };
      this.end = { x: x2, y: y2 };
    } else {
      this.start = { x: x2, y: y2 };
      this.end = { x: x1, y: y1 };
    }

    this.roughElement = generator.line(x1, y1, x2, y2, this.meta);
  }
  getAnchor(x, y) {
    let anchor = null;
    if (distance({ x, y }, this.start) < closeDist) {
      anchor = this.end;
    } else if (distance({ x, y }, this.end) < closeDist) {
      anchor = this.start;
    } else {
      const middle = { x, y };
      const offset =
        distance(this.start, this.end) -
        (distance(this.start, middle) + distance(this.end, middle));
      if (Math.abs(offset) < 1) {
        anchor = "inside";
      }
    }
    return anchor;
  }
}

class Rectangle extends Element {
  constructor(index, x1, y1, x2, y2, meta = null) {
    super(index, Rectangle, x1, y1, x2, y2, meta);
    const width = Math.abs(x1 - x2);
    const height = Math.abs(y1 - y2);

    this.minX = Math.min(x1, x2);
    this.minY = Math.min(y1, y2);
    this.maxX = Math.max(x1, x2);
    this.maxY = Math.max(y1, y2);
    this.roughElement = generator.rectangle(
      this.minX,
      this.minY,
      width,
      height,
      this.meta
    );
  }
  getAnchor(x, y) {
    const { minX, minY, maxX, maxY } = this;
    let anchor = null;
    let closestCorner = {};
    let candidateAnchor = {};
    if (
      distance({ x, y }, { x: minX, y }) < distance({ x, y }, { x: maxX, y })
    ) {
      candidateAnchor.x = maxX;
      closestCorner.x = minX;
    } else {
      candidateAnchor.x = minX;
      closestCorner.x = maxX;
    }
    if (
      distance({ x, y }, { x, y: minY }) < distance({ x, y }, { x, y: maxY })
    ) {
      candidateAnchor.y = maxY;
      closestCorner.y = minY;
    } else {
      candidateAnchor.y = minY;
      closestCorner.y = maxY;
    }
    if (distance({ x, y }, closestCorner) < closeDist) {
      anchor = candidateAnchor;
    } else if (x >= minX && x <= maxX && minY <= y && y <= maxY) {
      anchor = "inside";
    }
    return anchor;
  }
}

class Circle extends Element {
  constructor(index, x1, y1, x2, y2, meta = null) {
    super(index, Circle, x1, y1, x2, y2, meta);
    this.radius = Math.ceil(
      Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))
    );

    this.center = { x: x2, y: y2 };
    this.roughElement = generator.circle(
      this.center.x,
      this.center.y,
      2 * this.radius,
      this.meta
    );
  }
  getAnchor(x, y) {
    let anchor = null;
    const distToCenter = distance({ x, y }, this.center);
    if (Math.abs(distToCenter - this.radius) < closeDist) {
      anchor = this.center;
    } else if (distToCenter <= this.radius) {
      anchor = "inside";
    }
    return anchor;
  }
}

function createElement(index, type, x1, y1, x2, y2, meta = null) {
  switch (type) {
    case "line":
      return new Line(index, x1, y1, x2, y2, meta);
    case "rectangle":
      return new Rectangle(index, x1, y1, x2, y2, meta);
    case "circle":
      return new Circle(index, x1, y1, x2, y2, meta);
    default:
      console.error("unknown type: " + type);
  }
}

function distance(point1, point2) {
  return Math.sqrt(
    (point1.x - point2.x) * (point1.x - point2.x) +
      (point1.y - point2.y) * (point1.y - point2.y)
  );
}

function getElementAtPosition(x, y, elements) {
  const lastIndex = elements
    .map((element) => element.getAnchor(x, y) !== null)
    .lastIndexOf(true);
  if (lastIndex >= 0) {
    const element = elements[lastIndex];
    return { ...element, anchor: element.getAnchor(x, y) };
  }
  return null;
}

function cursorForPosition(x, y, anchor) {
  if (anchor === "inside") {
    return "move";
  } else if ((x - anchor.x) * (y - anchor.y) <= 0) {
    return "nesw-resize";
  } else {
    return "nwse-resize";
  }
}

const App = () => {
  const [elements, setElements, undo, redo] = useHistory([]);
  const [pipeline, setPipeline] = useState([
    new Cat(
      "hello\nworld\n It's been   real, but ultimately\n We all end up telling lies."
    ),
    new XArgs(5),
    new Grep(/l+/),
    new XArgs(1),
    new Sink(),
  ]);
  const [highlightedTool, setHighlightedTool] = useState(0);

  useEffect(() => {
    const undoRedoFunction = (event) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === "z" || event.key === "Z")
      ) {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    document.addEventListener("keydown", undoRedoFunction);
    return () => {
      document.removeEventListener("keydown", undoRedoFunction);
    };
  }, [undo, redo]);

  const updateElement = (element) => {
    const elementsCopy = [...elements];
    elementsCopy[element.index] = element;
    setElements(elementsCopy, true);
  };

  const updatePipeline = (position, tool) => {
    const pipelineCopy = [...pipeline];
    pipelineCopy[position] = tool;
    setPipeline(pipelineCopy);
  };

  const deleteElement = (index) => {
    const elementsCopy = [...elements];
    elementsCopy.splice(index, 1);
    elementsCopy.map((element, index) => {
      element.index = index;
      return element;
    });
    setElements(elementsCopy);
  };

  useLayoutEffect(() => {
    const canvas = document.getElementById(canvasId);
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    const roughCanvas = rough.canvas(canvas);
    let lines = null;
    for (let i = 0; i < pipeline.length; i++) {
      const tool = pipeline[i];
      lines = tool.apply(lines);
      tool
        .getElements(i, lines, highlightedTool === i ? true : false)
        .forEach((element) => roughCanvas.draw(element));
    }
  }, [pipeline, highlightedTool]);

  const handlePointerDown = (event) => {
    //if (toolType === "select") {
    //  const element = getElementAtPosition(clientX, clientY, elements);
    //  if (element) {
    //    setElements((prevState) => prevState);
    //    if (element.anchor === "inside") {
    //      setAction("moving");
    //    } else {
    //      setAction("resize");
    //    }
    //    const { index, x1, y1, anchor } = element;
    //    setSelected({
    //      index,
    //      offsetX: x1 - clientX,
    //      offsetY: y1 - clientY,
    //      anchor,
    //    });
    //  }
    //} else if (toolType === "delete") {
    //  const element = getElementAtPosition(clientX, clientY, elements);
    //  if (element !== null) {
    //    deleteElement(element.index);
    //  }
    //} else {
    //  setAction("drawing");
    //  const element = createElement(
    //    elements.length,
    //    toolType,
    //    clientX,
    //    clientY,
    //    clientX,
    //    clientY,
    //    meta
    //  );
    //  setElements((prevState) => [...prevState, element]);
    //  setSelected({ index: element.index });
    //}
  };
  const handlePointerMove = (event) => {
    //const { clientX, clientY } = event;
    //if (toolType === "select") {
    //  const element = getElementAtPosition(clientX, clientY, elements);
    //  event.target.style.cursor = element
    //    ? cursorForPosition(clientX, clientY, element.anchor)
    //    : "default";
    //}
    //if (action === "moving") {
    //  const { index, offsetX, offsetY } = selected;
    //  const movedElement = elements[index].move(
    //    clientX + offsetX,
    //    clientY + offsetY
    //  );
    //  updateElement(movedElement);
    //} else if (action === "resize") {
    //  const { index, anchor } = selected;
    //  const resizedElement = elements[index].resize(clientX, clientY, anchor);
    //  updateElement(resizedElement);
    //} else if (toolType === "delete") {
    //  const element = getElementAtPosition(clientX, clientY, elements);
    //  event.target.style.cursor = element ? "not-allowed" : "default";
    //} else if (action === "drawing") {
    //  const { index } = selected;
    //  const redrawnElement = elements[index].redraw(clientX, clientY);
    //  updateElement(redrawnElement);
    //}
  };
  const handlePointerUp = (event) => {
    const { clientX, clientY } = event;
    for (let i = 0; i < pipeline.length; i++) {
      console.log(
        "pipeline[i].isInside(i)",
        i,
        pipeline[i].isInside(i, clientX, clientY)
      );
      if (pipeline[i].isInside(i, clientX, clientY)) {
        setHighlightedTool(i);
      }
    }
    //const clickedTool = src.getToolAtPosition(clientX, clientY);
    //if (clickedTool) {
    //  setHighlightedTool(clickedTool);
    //}

    //setAction(null);
    //setSelected(null);
  };

  return (
    <div>
      <div style={{ position: "fixed" }}>Pipeline Visualization:</div>
      <div style={{ position: "fixed", bottom: 0, padding: 100 }}>
        {pipeline[highlightedTool].config((tool) =>
          updatePipeline(highlightedTool, tool)
        )}
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
