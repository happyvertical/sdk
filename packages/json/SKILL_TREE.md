flowchart LR

subgraph 0["src"]
subgraph 1["__tests__"]
2["benchmark.bench.ts"]
end
subgraph 3["adapters"]
4["native.ts"]
7["index.ts"]
8["sonic.ts"]
end
5["types.ts"]
6["index.ts"]
9["factory.ts"]
end
2-->4
2-->6
4-->5
6-->7
6-->9
6-->5
7-->4
7-->8
8-->5
9-->4
9-->8
9-->5
