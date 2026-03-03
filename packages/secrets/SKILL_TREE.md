flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["database.ts"]
end
subgraph 3["shared"]
4["envelope.ts"]
5["types.ts"]
6["errors.ts"]
A["factory.ts"]
end
subgraph 7["cli"]
8["claude-context.ts"]
end
9["index.ts"]
end
2-->4
2-->6
2-->5
4-->5
9-->2
9-->4
9-->6
9-->A
9-->5
A-->2
A-->5
