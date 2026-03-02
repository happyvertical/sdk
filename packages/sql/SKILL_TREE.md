flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["duckdb.ts"]
4["schema-manager.ts"]
subgraph 5["shared"]
6["types.ts"]
7["alter-utils.ts"]
8["duckdb-schema-utils.ts"]
9["utils.ts"]
end
A["index.ts"]
B["json.ts"]
C["postgres.ts"]
D["sqlite.ts"]
end
3-->4
3-->7
3-->8
3-->6
3-->6
3-->9
4-->6
7-->6
9-->6
A-->3
A-->B
A-->C
A-->C
A-->4
A-->4
A-->8
A-->6
A-->6
A-->9
A-->9
A-->D
A-->D
B-->4
B-->8
B-->6
B-->6
B-->9
C-->4
C-->7
C-->6
C-->6
C-->9
D-->4
D-->7
D-->6
D-->6
D-->9
