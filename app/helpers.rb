# Helper methods defined here can be accessed in any controller or view in the application

module Beamit
  class App
    module Helper
      def code(file, language=nil)
        output = '<div class="codeblock">'
        output << '<div class="title">'
        output << link_to(file, "code/#{file}")
        output << '</div>'
        output << '<pre><code'
        output << %Q{ class="#{language}"} if language
        output << ">"
        code = h!(File.read(File.join(Padrino.root, 'public', 'code', file)))
        output << code
        output << '</code></pre></div>'

        preserve do
          output.html_safe
        end
      end

      def register_presenter(socket, presentation)
        if presenter(presentation)
          register_slave(presenter(presentation), presentation)
          EM.next_tick { presenter(presentation).send({event: :disown}.to_json) }
          broadcast_slaves({event: :disown}.to_json, presentation)
        end
        settings.presenters[presentation] = socket
        unregister_slave(socket, presentation)
        EM.next_tick { presenter(presentation).send({event: :empower}.to_json) }
      end

      def unregister_presenter(presentation)
        settings.presenters[presentation] = nil
      end

      def register_slave(socket, presentation)
        slaves(presentation) << socket
      end

      def unregister_slave(socket, presentation)
        slaves(presentation).delete(socket)
      end

      def broadcast_slaves(message, presentation)
        EM.next_tick { slaves(presentation).each { |s| s.send(message) } }
      end

      def send_presenter(message, presentation)
        EM.next_tick { presenter(presentation).send(message) }
      end

      def slaves(presentation)
        settings.slaves[presentation] ||= []
      end

      def presenter(presentation)
        settings.presenters[presentation]
      end

    end

    helpers Helper
  end
end
