const axios = require('axios');
const dns = require('dns').promises;

const RAILWAY_GRAPHQL_ENDPOINT = 'https://backboard.railway.com/graphql/v2';

/**
 * Helper to resolve domain host to IPv4
 */
async function resolveHostToIp(host) {
  if (!host) return null;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return host;
  try {
    const res = await dns.lookup(host);
    return res.address;
  } catch (e) {
    return host;
  }
}

/**
 * Execute GraphQL Query/Mutation against Railway API
 */
async function railwayGraphQL(token, query, variables = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token && typeof token === 'string' && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }
  try {
    const response = await axios.post(
      RAILWAY_GRAPHQL_ENDPOINT,
      { query, variables },
      {
        headers,
        timeout: 25000,
      }
    );

    if (response.data.errors && response.data.errors.length > 0) {
      const errMsg = response.data.errors.map(e => e.message).join(' | ');
      throw new Error(`Railway API Error: ${errMsg}`);
    }

    return response.data.data;
  } catch (error) {
    if (error.response && error.response.data && error.response.data.errors) {
      const errMsg = error.response.data.errors.map(e => e.message).join(' | ');
      throw new Error(errMsg);
    }
    throw error;
  }
}

/**
 * Validate Railway API Token & Get Account Details
 */
async function validateToken(token) {
  // 1. Try querying 'me' (for user session/OAuth tokens)
  try {
    const userQuery = `
      query GetAccountInfo {
        me {
          id
          name
          email
          username
          isVerified
          workspaces {
            id
            name
          }
        }
      }
    `;
    const userData = await railwayGraphQL(token, userQuery);
    if (userData && userData.me) {
      return {
        id: userData.me.id,
        name: userData.me.name || userData.me.username || 'Railway User',
        email: userData.me.email || 'Verified Account',
        workspaces: userData.me.workspaces || [],
        primaryWorkspaceId: userData.me.workspaces?.[0]?.id || null,
      };
    }
  } catch (e) {
    // Fallback if 'me' is restricted on Workspace API tokens
  }

  // 2. Query 'projects' (works for Workspace & Personal API Tokens)
  const projectsQuery = `
    query GetProjects {
      projects {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  const data = await railwayGraphQL(token, projectsQuery);
  if (data && data.projects) {
    return {
      id: 'workspace-api-token',
      name: 'Railway Account (Token)',
      email: 'API Token Active',
      workspaces: [],
      primaryWorkspaceId: null,
    };
  }

  throw new Error('Token Railway tidak valid atau tidak memiliki izin akses.');
}

/**
 * Create a new Railway Project
 */
async function createProject(token, name = 'r-server', description = null, workspaceId = null) {
  // Resolve workspaceId if not provided (needed for OAuth user tokens)
  if (!workspaceId) {
    try {
      const userQuery = `query { me { workspaces { id } } }`;
      const userData = await railwayGraphQL(token, userQuery);
      workspaceId = userData?.me?.workspaces?.[0]?.id || null;
    } catch (e) {}
  }

  const query = `
    mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        name
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `;
  const input = {
    name,
    description: description || 'Linux Cloud VPS & Web Dashboard deployed via Telegram Bot',
  };
  if (workspaceId) {
    input.workspaceId = workspaceId;
  }

  const data = await railwayGraphQL(token, query, { input });

  const project = data.projectCreate;
  const prodEnv = project.environments.edges.find(e => e.node.name === 'production') || project.environments.edges[0];
  const environmentId = prodEnv ? prodEnv.node.id : null;

  return {
    projectId: project.id,
    projectName: project.name,
    environmentId,
  };
}

/**
 * Update Project Description
 */
async function updateProjectDescription(token, projectId, description) {
  const query = `
    mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
      projectUpdate(id: $id, input: $input) {
        id
        name
        description
      }
    }
  `;
  try {
    const data = await railwayGraphQL(token, query, {
      id: projectId,
      input: { description }
    });
    return data?.projectUpdate || null;
  } catch (err) {
    return null;
  }
}

/**
 * Create a Service connected to a GitHub Repository
 */
async function createServiceFromRepo(token, projectId, fullRepoName = 'myramm/r-server', branch = 'main') {
  const query = `
    mutation CreateService($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `;
  const data = await railwayGraphQL(token, query, {
    input: {
      projectId,
      name: 'r-server',
      source: {
        repo: fullRepoName,
      },
      branch,
    }
  });

  return data.serviceCreate;
}

/**
 * Set Environment Variables for a Service
 */
async function setVariable(token, projectId, environmentId, serviceId, name, value, skipDeploys = false) {
  const query = `
    mutation SetVar($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;
  return await railwayGraphQL(token, query, {
    input: {
      projectId,
      environmentId,
      serviceId,
      name,
      value,
      skipDeploys: Boolean(skipDeploys),
    }
  });
}

/**
 * Delete an Environment Variable for a Service
 */
async function deleteVariable(token, projectId, environmentId, serviceId, name) {
  const query = `
    mutation DeleteVar($input: VariableDeleteInput!) {
      variableDelete(input: $input)
    }
  `;
  try {
    const data = await railwayGraphQL(token, query, {
      input: {
        projectId,
        environmentId,
        serviceId,
        name,
      }
    });
    return data?.variableDelete || false;
  } catch (err) {
    return false;
  }
}

/**
 * Create TCP Proxy for Port 22 (SSH)
 */
async function createTcpProxy(token, environmentId, serviceId, applicationPort = 22) {
  const query = `
    mutation CreateTCPProxy($input: TCPProxyCreateInput!) {
      tcpProxyCreate(input: $input) {
        id
        domain
        proxyPort
        applicationPort
      }
    }
  `;
  try {
    const data = await railwayGraphQL(token, query, {
      input: {
        environmentId,
        serviceId,
        applicationPort,
      }
    });
    return data.tcpProxyCreate;
  } catch (err) {
    // If proxy already exists, ignore or fetch it
    return null;
  }
}

/**
 * Create Public HTTP Domain for Web Dashboard
 */
async function createServiceDomain(token, environmentId, serviceId) {
  const query = `
    mutation CreateDomain($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) {
        id
        domain
      }
    }
  `;
  try {
    const data = await railwayGraphQL(token, query, {
      input: {
        environmentId,
        serviceId,
        targetPort: 8080,
      }
    });
    return data.serviceDomainCreate;
  } catch (err) {
    return null;
  }
}

/**
 * Trigger Redeployment of a Service Instance
 */
async function triggerRedeploy(token, environmentId, serviceId) {
  const query = `
    mutation Redeploy($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  `;
  try {
    return await railwayGraphQL(token, query, { environmentId, serviceId });
  } catch (err) {
    return false;
  }
}

/**
 * Get Service TCP Proxies & Domain Information
 */
async function getServiceNetworking(token, projectId) {
  try {
    const query = `
      query GetProject($id: String!) {
        project(id: $id) {
          id
          name
          services {
            edges {
              node {
                id
                name
                serviceInstances {
                  edges {
                    node {
                      environmentId
                      domains {
                        serviceDomains {
                          domain
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const data = await railwayGraphQL(token, query, { id: projectId });
    const service = data.project.services.edges[0]?.node;
    if (!service) return { domain: null, tcpProxy: null };

    const instanceNode = service.serviceInstances.edges[0]?.node;
    const environmentId = instanceNode?.environmentId;
    const domain = instanceNode?.domains?.serviceDomains[0]?.domain || null;

    let sshProxy = null;
    let rdpProxy = null;
    if (environmentId && service.id) {
      try {
        const tcpQuery = `
          query GetTCPProxies($environmentId: String!, $serviceId: String!) {
            tcpProxies(environmentId: $environmentId, serviceId: $serviceId) {
              id
              domain
              proxyPort
              applicationPort
            }
          }
        `;
        const tcpData = await railwayGraphQL(token, tcpQuery, { environmentId, serviceId: service.id });
        if (tcpData && tcpData.tcpProxies && tcpData.tcpProxies.length > 0) {
          sshProxy = tcpData.tcpProxies.find(p => p.applicationPort === 22) || tcpData.tcpProxies[0];
          rdpProxy = tcpData.tcpProxies.find(p => p.applicationPort === 3389) || null;
        }
      } catch (err) {}
    }

    const sshHost = (sshProxy?.domain || '').replace(/\.$/, '');
    const sshIp = await resolveHostToIp(sshHost);
    const rdpHost = (rdpProxy?.domain || sshHost || '').replace(/\.$/, '');
    const rdpIp = await resolveHostToIp(rdpHost);

    return {
      domain,
      tcpProxy: sshProxy,
      sshHost,
      sshIp: sshIp || sshHost,
      sshPort: sshProxy?.proxyPort || 22,
      rdpProxy,
      rdpHost,
      rdpIp: rdpIp || rdpHost,
      rdpPort: rdpProxy?.proxyPort || 3389,
      serviceId: service.id
    };
  } catch (err) {
    return { domain: null, tcpProxy: null, sshHost: null, sshIp: null, sshPort: null, rdpProxy: null, rdpHost: null, rdpIp: null, rdpPort: null, serviceId: null };
  }
}

/**
 * Get Deployment Status
 */
async function getDeploymentStatus(token, environmentId, serviceId) {
  const query = `
    query GetDeployments($serviceId: String!) {
      deployments(input: { serviceId: $serviceId }, first: 1) {
        edges {
          node {
            id
            status
            createdAt
          }
        }
      }
    }
  `;
  try {
    const data = await railwayGraphQL(token, query, { serviceId });
    const latest = data.deployments?.edges[0]?.node;
    return latest || { status: 'INITIALIZING' };
  } catch (e) {
    return { status: 'BUILDING' };
  }
}

/**
 * List all projects on user account
 */
async function listProjects(token) {
  // 1. Try querying 'me' (for user/OAuth session tokens)
  try {
    const userQuery = `
      query ListUserProjects {
        me {
          id
          projects {
            edges {
              node {
                id
                name
                createdAt
                services {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
          workspaces {
            id
            name
            projects {
              edges {
                node {
                  id
                  name
                  createdAt
                  services {
                    edges {
                      node {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const data = await railwayGraphQL(token, userQuery);
    if (data && data.me) {
      const projectMap = new Map();
      if (data.me.projects?.edges) {
        data.me.projects.edges.forEach(e => {
          if (e?.node?.id) projectMap.set(e.node.id, e.node);
        });
      }
      if (data.me.workspaces) {
        data.me.workspaces.forEach(w => {
          if (w?.projects?.edges) {
            w.projects.edges.forEach(e => {
              if (e?.node?.id) projectMap.set(e.node.id, e.node);
            });
          }
        });
      }
      return Array.from(projectMap.values());
    }
  } catch (e) {
    // Fallback to top-level projects query if me is not accessible
  }

  // 2. Fallback for Workspace API tokens
  const projectsQuery = `
    query ListProjects {
      projects {
        edges {
          node {
            id
            name
            createdAt
            services {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;
  const fallbackData = await railwayGraphQL(token, projectsQuery);
  return (fallbackData?.projects?.edges || []).map(e => e.node);
}

/**
 * Delete a Project
 */
async function deleteProject(token, projectId) {
  const query = `
    mutation DeleteProject($id: String!) {
      projectDelete(id: $id)
    }
  `;
  return await railwayGraphQL(token, query, { id: projectId });
}

/**
 * Get Full VPS Details (Networking, Login Credentials, Variables, XRDP)
 */
async function getProjectDetails(token, projectId) {
  const query = `
    query GetProjectDetails($id: String!) {
      project(id: $id) {
        id
        name
        description
        createdAt
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
        services {
          edges {
            node {
              id
              name
              serviceInstances {
                edges {
                  node {
                    environmentId
                    domains {
                      serviceDomains {
                        domain
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  try {
    const data = await railwayGraphQL(token, query, { id: projectId });
    const project = data.project;
    if (!project) return null;

    const environmentId = project.environments.edges[0]?.node?.id;
    const service = project.services.edges[0]?.node;
    const serviceId = service?.id;
    const domain = service?.serviceInstances.edges[0]?.node?.domains?.serviceDomains[0]?.domain || null;

    let sshProxy = null;
    let rdpProxy = null;
    let variables = {};
    if (environmentId && serviceId) {
      try {
        const tcpQuery = `
          query GetTCPProxies($environmentId: String!, $serviceId: String!) {
            tcpProxies(environmentId: $environmentId, serviceId: $serviceId) {
              id
              domain
              proxyPort
              applicationPort
            }
          }
        `;
        const tcpData = await railwayGraphQL(token, tcpQuery, { environmentId, serviceId });
        if (tcpData?.tcpProxies?.length > 0) {
          sshProxy = tcpData.tcpProxies.find(p => p.applicationPort === 22) || tcpData.tcpProxies[0];
          rdpProxy = tcpData.tcpProxies.find(p => p.applicationPort === 3389) || null;
        }
      } catch (e) {}

      try {
        const varQuery = `
          query GetVariables($projectId: String!, $environmentId: String!, $serviceId: String!) {
            variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
          }
        `;
        const varData = await railwayGraphQL(token, varQuery, { projectId, environmentId, serviceId });
        variables = varData?.variables || {};
      } catch (e) {}
    }

    const sshHost = (sshProxy?.domain || variables.RAILWAY_TCP_PROXY_DOMAIN || '').replace(/\.$/, '');
    const sshIp = await resolveHostToIp(sshHost);
    const sshPort = sshProxy?.proxyPort || variables.RAILWAY_TCP_PROXY_PORT || 22;

    const rdpHost = (rdpProxy?.domain || sshHost || '').replace(/\.$/, '');
    const rdpIp = await resolveHostToIp(rdpHost);
    const rdpPort = rdpProxy?.proxyPort || 3389;

    const webDomain = domain || variables.RAILWAY_PUBLIC_DOMAIN || null;
    const rawOs = variables.OS_NAME || (project.description && project.description.includes('SSH Server') ? project.description.replace(/SSH Server.*/i, '').trim() : null) || variables.BASE_IMAGE || 'Debian 12 (Bookworm)';
    const osName = rawOs ? rawOs.replace(/deployed via Telegram Bot/i, '').trim() : 'Debian 12 (Bookworm)';
    const pass = variables.ROOT_PASSWORD || variables.SSH_PASSWORD || 'RamaGans76_';
    const isXrdp = variables.ENABLE_XRDP === 'true' || variables.ENABLE_DESKTOP === 'true';

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      osName: osName || 'Debian 12 (Bookworm)',
      createdAt: project.createdAt,
      environmentId,
      serviceId,
      domain: webDomain ? `https://${webDomain}` : null,
      tcpHost: sshHost,
      tcpIp: sshIp || sshHost,
      tcpPort: sshPort,
      rdpHost,
      rdpIp: rdpIp || rdpHost,
      rdpPort,
      hasRdpProxy: Boolean(rdpProxy),
      rootPassword: pass,
      enableXrdp: Boolean(isXrdp),
      nodeVersion: variables.NODE_VERSION || '20',
      aiAgents: variables.INSTALL_AI || '',
      extraPackages: variables.EXTRA_PACKAGES || '',
    };
  } catch (err) {
    return null;
  }
}

/**
 * List all projects with full networking & login credentials
 */
async function listProjectsWithDetails(token) {
  const projects = await listProjects(token);
  if (!projects || projects.length === 0) return [];
  const details = await Promise.all(
    projects.map(p => getProjectDetails(token, p.id).catch(() => ({ id: p.id, name: p.name, createdAt: p.createdAt })))
  );
  return details.filter(Boolean);
}

/**
 * Create a Device Code Login Session (OAuth Browserless Flow)
 */
async function createLoginSession() {
  const query = `
    mutation CreateSession {
      loginSessionCreate
    }
  `;
  const data = await railwayGraphQL(null, query);
  return data.loginSessionCreate;
}

/**
 * Check/Consume a Device Code Login Session
 * Returns session token string if approved, or null if pending/not approved yet
 */
async function consumeLoginSession(code) {
  const query = `
    mutation ConsumeSession($code: String!) {
      loginSessionConsume(code: $code)
    }
  `;
  try {
    const data = await railwayGraphQL(null, query, { code });
    return data?.loginSessionConsume || null;
  } catch (err) {
    return null;
  }
}

/**
 * Cancel a Device Code Login Session
 */
async function cancelLoginSession(code) {
  const query = `
    mutation CancelSession($code: String!) {
      loginSessionCancel(code: $code)
    }
  `;
  try {
    const data = await railwayGraphQL(null, query, { code });
    return data?.loginSessionCancel || false;
  } catch (err) {
    return false;
  }
}

module.exports = {
  validateToken,
  createProject,
  createServiceFromRepo,
  setVariable,
  deleteVariable,
  createTcpProxy,
  createServiceDomain,
  triggerRedeploy,
  getServiceNetworking,
  getDeploymentStatus,
  listProjects,
  getProjectDetails,
  listProjectsWithDetails,
  deleteProject,
  updateProjectDescription,
  createLoginSession,
  consumeLoginSession,
  cancelLoginSession,
  resolveHostToIp,
};


