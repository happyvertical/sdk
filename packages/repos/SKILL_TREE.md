flowchart LR

subgraph 0["src"]
1["errors.ts"]
2["factory.ts"]
subgraph 3["github"]
4["index.ts"]
6["rest.ts"]
end
5["types.ts"]
7["index.ts"]
8["parsing.ts"]
end
2-->1
2-->4
2-->5
4-->5
4-->6
6-->1
7-->1
7-->2
7-->4
7-->8
7-->8
7-->5
8-->5
