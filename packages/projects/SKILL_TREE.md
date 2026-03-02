flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["errors.ts"]
4["factory.ts"]
subgraph 5["github"]
6["index.ts"]
end
7["types.ts"]
8["index.ts"]
end
4-->3
4-->6
4-->7
6-->3
6-->7
8-->3
8-->4
8-->6
8-->7
8-->7
