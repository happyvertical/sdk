flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["errors.ts"]
4["factory.ts"]
subgraph 5["github"]
6["index.ts"]
8["rest.ts"]
end
7["types.ts"]
9["index.ts"]
A["parsing.ts"]
end
4-->3
4-->6
4-->7
6-->7
6-->8
8-->3
9-->3
9-->4
9-->6
9-->A
9-->A
9-->7
A-->7
