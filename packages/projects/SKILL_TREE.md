flowchart LR

subgraph 0["src"]
1["errors.ts"]
2["factory.ts"]
subgraph 3["github"]
4["index.ts"]
end
5["types.ts"]
6["index.ts"]
end
2-->1
2-->4
2-->5
4-->1
4-->5
6-->1
6-->2
6-->4
6-->5
6-->5
