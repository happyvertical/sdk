flowchart LR

subgraph 0["src"]
1["factory.ts"]
subgraph 2["node"]
3["local.ts"]
end
subgraph 4["shared"]
5["base.ts"]
6["types.ts"]
C["factory.ts"]
end
7["fetch.ts"]
8["filesystem-local.ts"]
9["filesystem.ts"]
A["index.ts"]
B["legacy.ts"]
end
1-->3
1-->6
3-->5
3-->6
5-->6
8-->9
8-->A
9-->A
A-->7
A-->9
A-->B
A-->3
A-->C
A-->C
A-->6
C-->3
C-->6
