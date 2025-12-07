flowchart LR

subgraph 0["src"]
subgraph 1["browser"]
2["web-ocr.ts"]
end
subgraph 3["shared"]
4["types.ts"]
6["factory.ts"]
end
5["index.ts"]
subgraph 7["node"]
8["onnx-gutenye.ts"]
9["tesseract.ts"]
end
end
2-->4
2-->4
5-->6
5-->4
6-->2
6-->8
6-->9
6-->4
6-->4
8-->4
8-->4
9-->4
9-->4
