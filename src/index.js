import React, { useEffect, useLayoutEffect, useState } from "react";
import ReactDOM from "react-dom";
//import './index.css';

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
    //this.setPosition(position);
    this.sink = null;
    this.color = color;
  }
  config() {
    return "undefined uggh";
  }
  setPosition(position) {
    this.position = position;
    this.width = 20;
    this.offset = 100;
    this.minY = 100;
    this.height = 250;
    this.minX = this.position * this.width * 10 + this.offset;
  }
  pipe(sink) {
    this.sink = sink;
    this.sink.setPosition(this.position + 1);
  }
  computeColor(line) {
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
  getOutputLine(index, outputSpacing, line) {
    this.computeColor(line);
    const y = this.minY + (index + 1) * outputSpacing;
    return generator.line(this.minX + this.width, y, this.sink.minX, y, {
      strokeWidth: 5,
      stroke: this.computeColor(line),
    });
  }
  getElements(lines = null) {
    console.info(lines);

    const elements = [
      generator.rectangle(this.minX, this.minY, this.width, this.height, {
        fill: this.color,
      }),
    ];
    if (this.sink) {
      if (lines) {
        const outputSpacing = Math.ceil(this.height / lines.length / 2);
        lines.forEach((line, index) =>
          elements.push(this.getOutputLine(index, outputSpacing, line))
        );
      }
      elements.push(...this.sink.getElements(lines));
    }
    return elements;
  }
}

class Cat extends Tool {
  constructor(text) {
    super("purple");
    this.text = text;
  }
  config() {
    const text = "hello bworld"; //this.text;
    return (
      <input
        //onChange={this.text=text}
        value={text}
        type="text"
        required
      />
    );
  }
  getElements() {
    return super.getElements(this.text.split("\n"));
  }
}

class XArgs extends Tool {
  constructor(n = null) {
    super("green");
    this.n = n;
  }
  getElements(lines = null) {
    const rebatchedLines = [];
    if (lines) {
      const words = [];
      lines.forEach((line) => words.push(...line.trim().split(/\s+/)));
      console.log("words:", words);
      const n = this.n ? this.n : words.length;
      for (let i = 0; i < words.length; i += n) {
        rebatchedLines.push(words.slice(i, i + n).join(" "));
      }
      console.log("rebatchedLines", rebatchedLines);
    }
    return super.getElements(rebatchedLines);
  }
}

class Grep extends Tool {
  constructor(regex) {
    super("blue");
    this.regex = new RegExp(regex);
  }
  getElements(lines = null) {
    const filteredLines = lines
      ? lines.filter((line) => this.regex.test(line))
      : [];
    return super.getElements(filteredLines);
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

const linkPipeline = (tools) => {
  if (tools.length === 0) {
    return;
  }
  let src = null;
  for (let i = 0; i < tools.length; i++) {
    if (src) {
      src.pipe(tools[i]);
    }
    src = tools[i];
    src.setPosition(i);
  }
  src.pipe(new Sink(1));
};

const App = () => {
  const src = new Cat(
    "hello\nworld\n It's been   real, but ultimately\n We all end up telling lies."
  );
  linkPipeline([src, new XArgs(1), new Grep(/l+/), new XArgs(null)]);

  const [elements, setElements, undo, redo] = useHistory([]);
  const [tools, setTools] = useState([src]);
  const [action, setAction] = useState(null);
  const [toolType, setToolType] = useState("line");
  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState(null);
  const [highlightedTool, setHighlightedTool] = useState(src);

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
    elements.forEach(({ roughElement }) => roughCanvas.draw(roughElement));
    tools.forEach((tool) => {
      tool.getElements().forEach((element) => roughCanvas.draw(element));
    });
  }, [elements, tools]);

  //setTools([new Tool(25, 25)])
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
    const clickedTool = src.getToolAtPosition(clientX, clientY);
    if (clickedTool) {
      setHighlightedTool(clickedTool);
    }

    //setAction(null);
    //setSelected(null);
  };

  return (
    <div>
      <div style={{ position: "fixed" }}>
        Drawing app:
        <input
          type="radio"
          id="select"
          checked={toolType === "select"}
          onChange={() => setToolType("select")}
        />
        <label htmlFor="select">Select</label>
        <input
          type="radio"
          id="delete"
          checked={toolType === "delete"}
          onChange={() => setToolType("delete")}
        />
        <label htmlFor="delete">Delete</label>
      </div>

      <div style={{ position: "fixed", bottom: 0, padding: 10 }}>
        <highlightedTool.config />
      </div>
      <div>
        <canvas
          id={canvasId}
          width={window.innerWidth}
          height={window.innerHeight}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          /*style={{backgroundColor:'blue'}}/**/
        >
          {" "}
          Canvas
        </canvas>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
/*//<button onClick={undo}>Undo</button>
        //<button onClick={redo}>Redo</button> //*/
