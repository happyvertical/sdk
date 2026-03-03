flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["index.ts"]
subgraph 4["tools"]
5["ask.ts"]
8["get-docs.ts"]
9["list-packages.ts"]
end
6["registry.ts"]
7["router.ts"]
end
3-->5
3-->8
3-->9
5-->6
5-->7
7-->6
8-->6
9-->6
