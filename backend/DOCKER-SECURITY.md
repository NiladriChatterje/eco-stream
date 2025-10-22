# Docker Security Best Practices

This document outlines the security measures implemented in the Docker configuration.

## Non-Root User Implementation

### Why Running as Non-Root Matters

Running containers as root poses significant security risks:
- **Container Escape**: If an attacker escapes the container, they have root access on the host
- **Privilege Escalation**: Vulnerabilities can be exploited to gain elevated privileges
- **Blast Radius**: Compromised containers can affect the entire system

### Implementation in Dockerfile

```dockerfile
# Create a non-root user with specific UID/GID
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of application files
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs
```

### Benefits

1. **Limited Privileges**: Application runs with minimal permissions
2. **Defense in Depth**: Additional security layer if container is compromised
3. **Compliance**: Meets security standards (CIS Docker Benchmark)
4. **File System Protection**: Prevents unauthorized file modifications

## Additional Security Measures

### 1. Image Selection
- Using `node:18-alpine` base image (minimal attack surface)
- Alpine Linux has fewer packages = fewer vulnerabilities
- Regularly updated official Node.js images

### 2. Dependency Management
```dockerfile
RUN npm ci --only=production
```
- `npm ci` ensures reproducible builds
- `--only=production` excludes dev dependencies
- Reduces package count and potential vulnerabilities

### 3. File Permissions
```dockerfile
RUN chown -R nodejs:nodejs /app
```
- Application files owned by nodejs user
- Prevents unauthorized modifications
- Follows principle of least privilege

### 4. Port Configuration
```dockerfile
EXPOSE 5010
```
- Documents expected ports
- Helps with network security policies
- No privileged ports (<1024) required

## Docker Compose Security

### Environment Variables
```yaml
environment:
  - REDIS_URL=redis://redis:6379
```
- Use secrets management in production
- Never commit sensitive data to repository
- Use Docker secrets or external secret managers

### Network Isolation
```yaml
services:
  backend-1:
    depends_on:
      redis:
        condition: service_healthy
```
- Services communicate on isolated Docker network
- No direct exposure to host network
- Health checks ensure proper startup order

## Production Security Checklist

### Container Security
- [x] Run as non-root user
- [ ] Use read-only file system where possible
- [ ] Set resource limits (CPU, memory)
- [ ] Enable security options (AppArmor, SELinux)
- [ ] Scan images for vulnerabilities
- [ ] Use minimal base images

### Runtime Security
```yaml
security_opt:
  - no-new-privileges:true
read_only: true
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE  # Only if needed
```

### Network Security
- [ ] Use private networks for inter-container communication
- [ ] Implement network policies
- [ ] Enable TLS for all connections
- [ ] Use firewall rules to restrict access

### Secret Management
- [ ] Use Docker secrets or Kubernetes secrets
- [ ] Rotate credentials regularly
- [ ] Never hardcode sensitive data
- [ ] Use environment-specific configurations

## Vulnerability Scanning

### Regular Scans
```bash
# Using Docker Scout
docker scout cves backend:latest

# Using Trivy
trivy image backend:latest

# Using Snyk
snyk container test backend:latest
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Run security scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'backend:latest'
    severity: 'CRITICAL,HIGH'
```

## Monitoring and Logging

### Container Logs
```bash
# View logs from non-root user
docker-compose logs -f backend-1

# Check for permission errors
docker exec backend-1 whoami
# Should output: nodejs
```

### Security Audits
```bash
# Audit npm packages
npm audit

# Check Docker image layers
docker history backend:latest

# Inspect running container
docker inspect backend-1
```

## Best Practices Summary

1. **Always run as non-root user**
2. **Keep base images updated**
3. **Minimize installed packages**
4. **Use specific image tags, not 'latest'**
5. **Scan images regularly**
6. **Implement least privilege access**
7. **Use secrets management**
8. **Enable security scanning in CI/CD**
9. **Monitor container behavior**
10. **Apply security patches promptly**

## Security Incident Response

If a security issue is detected:

1. **Isolate**: Stop affected containers
2. **Assess**: Determine scope of compromise
3. **Patch**: Update vulnerable components
4. **Scan**: Re-scan images and dependencies
5. **Deploy**: Roll out patched version
6. **Monitor**: Watch for suspicious activity

## Resources

- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [OWASP Docker Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## Compliance

This configuration helps meet requirements for:
- CIS Docker Benchmark
- NIST Application Container Security Guide
- PCI DSS (for payment processing)
- SOC 2 (for service organizations)
- GDPR (data protection)