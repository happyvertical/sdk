flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["index.ts"]
subgraph 4["shared"]
5["errors.ts"]
6["factory.ts"]
subgraph 7["providers"]
8["cognito.ts"]
A["github.ts"]
B["google.ts"]
C["kanidm.ts"]
D["keycloak.ts"]
subgraph E["nostr"]
F["index.ts"]
end
end
9["types.ts"]
end
end
3-->5
3-->6
3-->9
6-->8
6-->A
6-->B
6-->C
6-->D
6-->F
6-->9
8-->5
8-->9
A-->5
A-->9
B-->5
B-->9
C-->5
C-->9
D-->5
D-->9
F-->5
F-->9
