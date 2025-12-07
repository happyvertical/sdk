flowchart LR

subgraph 0["src"]
subgraph 1["browser"]
2["combined.ts"]
6["pdfjs.ts"]
7["factory.ts"]
end
subgraph 3["shared"]
4["base.ts"]
5["types.ts"]
9["factory.ts"]
end
8["index.ts"]
subgraph A["node"]
B["combined.ts"]
C["unpdf.ts"]
end
end
2-->4
2-->5
2-->6
4-->5
4-->5
4-->5
6-->4
6-->5
6-->5
6-->5
7-->5
7-->2
8-->4
8-->9
8-->9
8-->5
9-->B
9-->5
B-->4
B-->5
B-->5
B-->C
C-->4
C-->5
C-->5
