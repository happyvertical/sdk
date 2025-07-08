# Use official Node.js runtime as base image
FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=development
ENV FORCE_COLOR=1

# Install system dependencies for ONNX Runtime, OCR, and Ghostscript
RUN apt-get update && apt-get install -y \
    # C++ standard library and build tools
    libstdc++6 \
    libc6-dev \
    build-essential \
    gcc \
    g++ \
    cmake \
    # Additional dependencies for ONNX Runtime
    libgomp1 \
    libprotobuf-dev \
    # Ghostscript for PDF processing
    ghostscript \
    # Git LFS for large files
    git-lfs \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH for all users
ENV PATH="/root/.bun/bin:$PATH"
RUN echo 'export PATH="/root/.bun/bin:$PATH"' >> /etc/bash.bashrc

# Set working directory
WORKDIR /workspaces

# Install Bun for the node user (from base image)
USER node
RUN curl -fsSL https://bun.sh/install | bash
RUN echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

# Default command
CMD ["sleep", "infinity"]