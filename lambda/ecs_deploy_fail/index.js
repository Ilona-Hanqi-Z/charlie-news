const superagent = require('superagent');

exports.handler = (event, context) => {
    console.log(event);

    if (event.detail.lastStatus === 'STOPPED') {
        onStopped(event);
    }
    else if (event.detail.lastStatus === 'RUNNING' && event.detail.desiredStatus === 'RUNNING') {
        onStarted(event)
    }
};

function onStopped(event) {
    const stoppedReason = event.detail.stoppedReason;
    if (!stoppedReason) {
        console.error('No stopped reason, returning');
    }
    else if (stoppedReason.includes('Essential container in task exited')) {
        sendSlackMessage("API crashed", event, false);
    }
    else if (stoppedReason.includes('Task failed ELB health checks')) {
        sendSlackMessage("API unhealthy", event, false);
    }
    else {
        console.log('API stopped normally');
    }
}

function onStarted(event) {
    sendSlackMessage("New container running", event, true);
}

function sendSlackMessage(message, event, good) {
    let color = '#36a64f';
    let fields = [
        { title: 'Cluster', value: event.detail.clusterArn, short: false},
        { title: 'Service', value: event.detail.group, short: false},
        { title: 'Task', value: event.detail.taskDefinitionArn, short: false},
    ];

    if (!good) {
        color = '#d63600';
        fields.push({ title: 'Reason', value: event.detail.stoppedReason, short: false})
    }

    let fallback = `*Cluster:* ${event.detail.clusterArn}\n` +
        `*Service:* ${event.detail.group}\n*Task:* ${event.detail.taskDefinitionArn}\n*Reason:* ${event.detail.stoppedReason}`;
    superagent
        .post('https://hooks.slack.com/services/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')
        .send({
            text: message,
            attachments: [
                {
                    fallback,
                    color,
                    fields
                }
            ]
        })
        .end();
}