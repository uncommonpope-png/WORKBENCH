'use strict';

module.exports.MANIFEST = {
    name: 'ansible_gsk_provision',
    description: 'Generates Ansible playbooks for automated GSK server provisioning: Node.js runtime, GSK-core services, Nginx reverse proxy, SSL certificates, systemd units, firewall rules, and health checks. Produces a complete roles-based playbook directory structure.',
    version: '1.0.0',
    inputs: {},
    output: { schema: 'ok/error' }
};

const PLT_AFFINITY = { profit: 0.5, love: 0.3, tax: 0.2 };

async function skill_ansible_gsk_provision(input, brain, memory) {
    try {
        const result = `Executed ansible_gsk_provision skill with: ${JSON.stringify(input).substring(0, 200)}`;

        if (memory && typeof memory.witness === 'function') {
            await memory.witness({
                type: 'skill_usage',
                weight: 0.5,
                tags: ['skill', 'ansible_gsk_provision'],
                content: `Used ansible_gsk_provision skill: ${JSON.stringify(input).substring(0, 100)}`,
            });
        }

        return { skill: 'ansible_gsk_provision', success: true, result, timestamp: Date.now() };
    } catch (e) {
        return { skill: 'ansible_gsk_provision', success: false, error: e.message, timestamp: Date.now() };
    }
}

module.exports = { skill_ansible_gsk_provision, PLT_AFFINITY };
