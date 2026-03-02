flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["index.ts"]
subgraph 4["providers"]
subgraph 5["quickbooks"]
6["index.ts"]
end
subgraph 8["stripe"]
9["index.ts"]
end
end
7["types.ts"]
end
3-->6
3-->9
3-->7
3-->7
6-->7
9-->7
