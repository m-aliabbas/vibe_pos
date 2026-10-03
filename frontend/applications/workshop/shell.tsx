import { ApplicationWorkspace } from '@/components/applications/ApplicationWorkspace';
import { WorkshopConsole } from '@/applications/workshop/WorkshopConsole';

export function WorkshopShell() {
    return (
        <ApplicationWorkspace expectedApplication="workshop">
            <WorkshopConsole />
        </ApplicationWorkspace>
    );
}
