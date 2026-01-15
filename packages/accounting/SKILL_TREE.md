flowchart LR

subgraph 0["src"]
1["index.ts"]
subgraph 2["providers"]
subgraph 3["quickbooks"]
4["index.ts"]
end
subgraph 6["stripe"]
7["index.ts"]
end
end
5["types.ts"]
end
1-->4
1-->7
1-->5
1-->5
4-->5
7-->5
