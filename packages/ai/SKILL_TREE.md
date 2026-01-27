flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["index.ts"]
subgraph 4["shared"]
5["client.ts"]
6["factory.ts"]
subgraph 7["providers"]
8["anthropic.ts"]
A["bedrock.ts"]
B["claude-cli.ts"]
C["gemini.ts"]
D["huggingface.ts"]
E["openai.ts"]
F["qwen-tts.ts"]
end
9["types.ts"]
G["message.ts"]
H["thread.ts"]
end
subgraph I["node"]
J["factory.ts"]
end
end
3-->5
3-->6
3-->G
3-->H
3-->9
5-->6
5-->G
6-->5
6-->8
6-->A
6-->B
6-->C
6-->D
6-->E
6-->F
6-->9
8-->9
8-->9
A-->9
A-->9
B-->9
B-->9
B-->8
C-->9
C-->9
D-->9
D-->9
E-->9
E-->9
F-->9
F-->9
G-->H
H-->5
H-->G
J-->6
J-->6
J-->9
