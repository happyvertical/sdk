flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["aws.ts"]
6["kanidm.ts"]
7["postgres.ts"]
8["stalwart.ts"]
end
subgraph 3["shared"]
4["errors.ts"]
5["types.ts"]
A["factory.ts"]
end
9["index.ts"]
end
2-->4
2-->5
6-->4
6-->5
7-->4
7-->5
8-->4
8-->5
9-->2
9-->6
9-->7
9-->8
9-->4
9-->A
9-->5
A-->2
A-->6
A-->7
A-->8
A-->5
